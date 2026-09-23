import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, format_time, formatdate

from logicx_biz.logicx_hr.doctype.enquiry.enquiry import add_enquiry_message

# Google Maps URLs "search" action: opens the Maps app on Android / iOS, the browser elsewhere
GOOGLE_MAPS_URL = "https://www.google.com/maps/search/?api=1&query={latitude}%2C{longitude}"
MESSAGE_TEMPLATE = "Location captured by {employee} at {date} {time}: {url}"
TRIGGER_FIELDS = ("enquiry", "latitude", "longitude")


class JobLocation(Document):
	def validate(self):
		self.set_location_fields()

	@frappe.whitelist()
	def set_location_fields(self):
		"""Check the coordinates and rebuild the Geolocation URL and Map from them.

		Also called by the form's "Get Current Location" button, so the pin shows before saving.
		"""
		self.validate_coordinates()
		self.geolocation_url = GOOGLE_MAPS_URL.format(
			latitude=self.format_coordinate("latitude"),
			longitude=self.format_coordinate("longitude"),
		)
		self.geolocation_map = json.dumps(
			{
				"type": "FeatureCollection",
				"features": [
					{
						"type": "Feature",
						"properties": {},
						# GeoJSON puts longitude first
						"geometry": {"type": "Point", "coordinates": [self.longitude, self.latitude]},
					}
				],
			}
		)

	def validate_coordinates(self):
		self.latitude = flt(self.latitude, self.precision("latitude"))
		self.longitude = flt(self.longitude, self.precision("longitude"))

		# Float columns are NOT NULL DEFAULT 0, so a location that was never sent arrives as 0, 0
		if not self.latitude and not self.longitude:
			frappe.throw(_("Latitude and Longitude are required."))
		if not -90 <= self.latitude <= 90:
			frappe.throw(_("Latitude must be between -90 and 90."))
		if not -180 <= self.longitude <= 180:
			frappe.throw(_("Longitude must be between -180 and 180."))

	def format_coordinate(self, fieldname):
		# fixed-point, so a value close to 0 never turns into "1e-05"
		return f"{self.get(fieldname):.{self.precision(fieldname)}f}"

	def on_update(self):
		if any(self.has_value_changed(fieldname) for fieldname in TRIGGER_FIELDS):
			self.post_enquiry_message()

	def post_enquiry_message(self):
		if not self.enquiry:
			return

		employee_name = frappe.get_cached_value("Employee", self.employee, "employee_name") or self.employee
		comment = MESSAGE_TEMPLATE.format(
			employee=employee_name,
			date=formatdate(self.date),
			time=format_time(self.time, "hh:mm a"),
			url=self.geolocation_url,
		)
		add_enquiry_message(self.enquiry, comment)
