import frappe
import re
from frappe.model.document import Document


class Enquiry(Document):
	def before_validate(self):
		if self.user_employee:
			return
		#
		employee_doc = get_current_employee()
		self.user_employee = employee_doc.name if employee_doc else None

	def validate(self):
		if self.mobile:
			self.mobile = self.mobile.strip()
			if not re.fullmatch(r"\d{10}", self.mobile):
				frappe.throw("Mobile must contain exactly 10 numeric digits.")




@frappe.whitelist()
def get_current_employee():
	employee_doc = None
	if frappe.session.user:
		employee_name = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
		employee_doc = frappe.get_doc("Employee", employee_name) if employee_name else None
	return employee_doc


def add_job_comments(job_type, job_id, comment):
	"""Add an auto-generated Job Comments record for a job (an Enquiry, a Task, ...).

	Used by related doctypes (Job Execution, Job Location, Job Attachment, Job Estimate) to log activity
	against the job they belong to.
	"""
	if not job_type or not job_id or not comment:
		return
	frappe.get_doc(
		{"doctype": "Job Comments", "job_type": job_type, "job_id": job_id, "comment": comment}
	).insert(ignore_permissions=True)
