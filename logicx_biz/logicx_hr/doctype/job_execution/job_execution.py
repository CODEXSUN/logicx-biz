import math
from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cstr, flt, formatdate, format_time, get_time, get_timedelta, getdate, nowdate, nowtime

from logicx_biz.logicx_hr.doctype.enquiry.enquiry import get_current_employee
from logicx_biz.logicx_hr.doctype.job_activity.job_activity import add_job_activity
from logicx_biz.logicx_hr.doctype.job_location.job_location import GOOGLE_MAPS_URL
from logicx_biz.logicx_hr.doctype.job_summary.job_summary import update_job_summary

# the fields its counts in Job Summary go by: Completed and Running per job
SUMMARY_FIELDS = ("job_type", "job_id", "status")


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
		The Employee must be the logged-in user's own, with no Running Job Execution on the same job;
		other jobs may run alongside.
		"""
		if not self.is_new():
			frappe.throw(_("Job Execution {0} has already been started.").format(self.name))

		current_employee = get_current_employee_id()
		self.employee = self.employee or current_employee
		if self.employee != current_employee:
			frappe.throw(
				_("You can only start a Job Execution for yourself ({0}).").format(current_employee),
				frappe.PermissionError,
			)

		running = frappe.db.get_value(
			"Job Execution",
			{"employee": self.employee, "job_type": self.job_type, "job_id": self.job_id, "status": "Running"},
			"name",
		)
		if running:
			frappe.throw(
				_("You have already started {0} {1} (Job Execution {2}). Stop or cancel it first.").format(
					_(self.job_type), self.job_id, running
				)
			)

		self.date = nowdate()
		self.start_time = nowtime()
		self.site = site or self.site
		self.latitude = flt(latitude, self.precision("latitude"))
		self.longitude = flt(longitude, self.precision("longitude"))
		self.status = "Running"
		self.save()
		self.post_job_activity()

	@frappe.whitelist(methods=["POST"])
	def stop_execution(self, action_details=None):
		"""Stop the Running job now: Completed at the server's today / now."""
		self.check_running()
		self.stop_date = nowdate()
		self.stop_time = nowtime()
		self.action_details = get_required_text(action_details, "Action Details")
		self.status = "Completed"
		self.save()
		self.post_job_activity()

	@frappe.whitelist(methods=["POST"])
	def cancel_execution(self, cancel_details=None):
		"""Cancel the Running job: no Stop Date / Time, so no Hours or Cost."""
		self.check_running()
		self.stop_date = None
		self.stop_time = None
		self.cancel_details = get_required_text(cancel_details, "Cancel Details")
		self.status = "Cancelled"
		self.save()
		self.post_job_activity()

	def check_running(self):
		"""Stop and cancel: only a Running Job Execution, and only by the Employee who started it."""
		if self.is_new() or self.status != "Running":
			frappe.throw(_("Only a Running Job Execution can be stopped or cancelled."))
		if self.employee != get_current_employee_id():
			frappe.throw(
				_("Only {0}, who started this Job Execution, can stop or cancel it.").format(self.employee),
				frappe.PermissionError,
			)

	def on_update(self):
		if any(self.has_value_changed(fieldname) for fieldname in SUMMARY_FIELDS):
			update_job_summary(self)

	def after_delete(self):
		update_job_summary(self)

	def post_job_activity(self):
		"""Post the status's Job Activity on the job.

		Posted by start / stop / cancel, not on save, so a status set on the form posts nothing.
		"""
		if self.status == "Running":
			activity_details = "Checked-in"
		elif self.status == "Cancelled":
			activity_details = f"CANCELLED the last check-in.\n{self.cancel_details}"
		else:
			lines = [
				f"Action Hours : {format_hours(self.hours)}",
				f"Started      : {formatdate(self.date)}  {format_time(self.start_time, 'h:mm a')}",
			]
			# Float columns are NOT NULL DEFAULT 0, so a location that was never sent is 0, 0
			if self.latitude or self.longitude:
				lines.append(f"Location     : {self.get_maps_url()}")
			lines.append(self.action_details)
			activity_details = "\n".join(lines)

		add_job_activity(self.job_type, self.job_id, activity_details, self.doctype, self.name)

	def get_maps_url(self) -> str:
		# fixed-point, so a value close to 0 never turns into "1e-05"
		return GOOGLE_MAPS_URL.format(
			latitude=f"{flt(self.latitude):.{self.precision('latitude')}f}",
			longitude=f"{flt(self.longitude):.{self.precision('longitude')}f}",
		)


def combine_datetime(date, time) -> datetime:
	return datetime.combine(getdate(date), get_time(time))


def format_hours(hours) -> str:
	"""Hours as h:mm: 1.5 -> "1:30"."""
	minutes = round(flt(hours) * 60)
	return f"{minutes // 60}:{minutes % 60:02d}"


def get_current_employee_id() -> str:
	"""The logged-in user's Employee; a PermissionError when no Employee is linked to them."""
	employee = get_current_employee()
	if not employee:
		frappe.throw(_("No Employee is linked to user {0}.").format(frappe.session.user), frappe.PermissionError)
	return employee.name


def get_required_text(value, label: str) -> str:
	value = cstr(value).strip()
	if not value:
		frappe.throw(_("{0} is required.").format(_(label)), frappe.MandatoryError)
	return value
