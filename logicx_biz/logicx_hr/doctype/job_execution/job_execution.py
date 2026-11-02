import math
from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cstr, flt, formatdate, format_time, get_time, get_timedelta, getdate, nowdate, nowtime

from logicx_biz.logicx_hr.doctype.job_activity.job_activity import add_job_activity

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
		if not (self.start_time and self.stop_time):
			self.hours = 0
			return

		if self.stop_date:
			diff = combine_datetime(self.stop_date, self.stop_time) - combine_datetime(self.date, self.start_time)
			if diff < timedelta(0):
				frappe.throw(_("Stop Date / Time cannot be before the Start Date / Time."))
		else:
			# no Stop Date: a Stop Time before the Start Time is taken as the next day
			diff = get_timedelta(self.stop_time) - get_timedelta(self.start_time)
			if diff < timedelta(0):
				diff += timedelta(days=1)
		# to the nearest half hour (0.5, 1, 1.5, ...): 1h 14m -> 1, 1h 15m -> 1.5,
		# except that any job from 1m to 44m is 0.5
		minutes = diff.total_seconds() / 60
		self.hours = math.floor(minutes / 30 + 0.5) / 2
		if not self.hours and minutes >= 1:
			self.hours = 0.5

	def calculate_total_cost(self):
		self.total_cost = flt(flt(self.hours) * flt(self.employee_cost_per_hour), 2)

	@frappe.whitelist(methods=["POST"])
	def start_execution(self, site=None, latitude=None, longitude=None):
		"""Start the job now: Running from the server's today / now.

		Called on the unsaved document (Job Type, Job ID and Employee filled in), which is created here.
		"""
		if not self.is_new():
			frappe.throw(_("Job Execution {0} has already been started.").format(self.name))

		self.date = nowdate()
		self.start_time = nowtime()
		self.site = site or self.site
		self.latitude = flt(latitude, self.precision("latitude"))
		self.longitude = flt(longitude, self.precision("longitude"))
		self.status = "Running"
		self.save()

	@frappe.whitelist(methods=["POST"])
	def stop_execution(self, action_details=None):
		"""Stop the Running job now: Completed at the server's today / now."""
		self.check_running()
		self.stop_date = nowdate()
		self.stop_time = nowtime()
		self.action_details = get_required_text(action_details, "Action Details")
		self.status = "Completed"
		self.save()

	@frappe.whitelist(methods=["POST"])
	def cancel_execution(self, cancel_details=None):
		"""Cancel the Running job: no Stop Date / Time, so no Hours or Cost."""
		self.check_running()
		self.stop_date = None
		self.stop_time = None
		self.cancel_details = get_required_text(cancel_details, "Cancel Details")
		self.status = "Cancelled"
		self.save()

	def check_running(self):
		if self.is_new() or self.status != "Running":
			frappe.throw(_("Only a Running Job Execution can be stopped or cancelled."))

	def on_update(self):
		if self.has_value_changed("status"):
			self.post_job_activity()

	def post_job_activity(self):
		template = STATUS_MESSAGE_TEMPLATES.get(self.status)
		if not template or not self.job_id:
			return

		employee_name = frappe.get_cached_value("Employee", self.employee, "employee_name") or self.employee
		if self.status == "Running":
			event_date, event_time = self.date, self.start_time
		else:
			event_date, event_time = self.stop_date or nowdate(), self.stop_time or nowtime()

		activity_details = template.format(
			employee=employee_name,
			date=formatdate(event_date),
			time=format_time(event_time, "hh:mm a"),
		)
		add_job_activity(self.job_type, self.job_id, activity_details, self.doctype, self.name)


def combine_datetime(date, time) -> datetime:
	return datetime.combine(getdate(date), get_time(time))


def get_required_text(value, label: str) -> str:
	value = cstr(value).strip()
	if not value:
		frappe.throw(_("{0} is required.").format(_(label)), frappe.MandatoryError)
	return value
