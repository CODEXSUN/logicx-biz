import frappe
from frappe.model.document import Document
from frappe.utils import today

from logicx_biz.logicx_hr.doctype.enquiry_daily_role.enquiry_daily_role import (
	JOB_ASSIGNEE,
	LEAD_CREATOR,
	delete_by_enquiry,
	merge,
)


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
