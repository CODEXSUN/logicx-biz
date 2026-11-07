import frappe
from frappe.model.document import Document
from frappe.utils import today

from logicx_biz.logicx_hr.doctype.enquiry_daily_role.enquiry_daily_role import (
	JOB_ASSIGNEE,
	LEAD_CREATOR,
	delete_by_enquiry,
	merge,
)

# an Enquiry on one of these goes to OPEN_STATUS when a Job Activity is added to it
OPENED_BY_JOB_ACTIVITY = ("New", "Re-open")
OPEN_STATUS = "Open"


class Enquiry(Document):
	def before_validate(self):
		if self.user_employee:
			return
		#
		employee_doc = get_current_employee()
		self.user_employee = employee_doc.name if employee_doc else None

	def on_update(self):
		# runs after insert as well as after each save: the lead on the Enquiry's
		# own Date, the job on the day of the save; an empty Lead By or Assigned To
		# takes that role off the Enquiry for its day
		merge(self.name, self.date, LEAD_CREATOR, self.user_employee or None)
		merge(self.name, today(), JOB_ASSIGNEE, self.assigned_to_employee or None)

	def on_trash(self):
		delete_by_enquiry(self.name)



@frappe.whitelist()
def get_current_employee():
	employee_doc = None
	if frappe.session.user:
		employee_name = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
		employee_doc = frappe.get_doc("Employee", employee_name) if employee_name else None
	return employee_doc


def open_on_job_activity(name):
	"""Move the Enquiry `name` to Open if it is on New or Re-open (see JobActivity.on_update).

	db_set rather than save: a line of activity must not fail on the Enquiry's own validation,
	nor touch its Enquiry Daily Role rows. `modified` still changes, so a form open on the old
	Status can't overwrite it. db_set writes no Version, so that is done here, to show the change
	on the Enquiry's timeline.
	"""
	if frappe.db.get_value("Enquiry", name, "status") in OPENED_BY_JOB_ACTIVITY:
		enquiry = frappe.get_doc("Enquiry", name)
		enquiry.db_set("status", OPEN_STATUS, notify=True)
		enquiry.save_version()
