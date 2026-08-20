from datetime import timedelta

import frappe
from frappe.model.document import Document
from frappe.utils import flt, formatdate, format_time, get_timedelta, nowtime

from logicx_biz.logicx_hr.doctype.enquiry.enquiry import add_enquiry_message

STATUS_MESSAGE_TEMPLATES = {
	"Running": "Job Started by {employee} at {date} {time}",
	"Completed": "Job Stopped by {employee} at {date} {time}",
	"Cancelled": "Job Cancelled by {employee} at {date} {time}",
}


class JobExecution(Document):
	def validate(self):
		self.calculate_hours()
		self.calculate_total_cost()

	def calculate_hours(self):
		if self.start_time and self.stop_time:
			start_time = get_timedelta(self.start_time)
			stop_time = get_timedelta(self.stop_time)
			diff = stop_time - start_time
			if diff < timedelta(0):
				diff += timedelta(days=1)
			self.hours = flt(diff.total_seconds() / 3600, 2)
		else:
			self.hours = 0

	def calculate_total_cost(self):
		self.total_cost = flt(flt(self.hours) * flt(self.employee_cost_per_hour), 2)

	def on_update(self):
		if self.has_value_changed("status"):
			self.post_enquiry_message()

	def post_enquiry_message(self):
		template = STATUS_MESSAGE_TEMPLATES.get(self.status)
		if not template or not self.enquiry:
			return

		employee_name = frappe.get_cached_value("Employee", self.employee, "employee_name") or self.employee
		event_time = self.start_time if self.status == "Running" else (self.stop_time or nowtime())

		comment = template.format(
			employee=employee_name,
			date=formatdate(self.date),
			time=format_time(event_time, "hh:mm a"),
		)
		add_enquiry_message(self.enquiry, comment)
