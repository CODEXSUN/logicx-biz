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


def add_enquiry_message(enquiry, comment):
	"""Append an auto-generated row to an Enquiry's Messages timeline.

	Used by related doctypes (Job Execution, Estimate) to log activity
	against the Enquiry they belong to.
	"""
	if not enquiry or not comment:
		return
	enquiry_doc = frappe.get_doc("Enquiry", enquiry)
	enquiry_doc.append("enquiry_messages", {"comment": comment})
	enquiry_doc.save(ignore_permissions=True)
