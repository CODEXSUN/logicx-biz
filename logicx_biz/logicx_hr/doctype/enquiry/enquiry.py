import frappe
from frappe import _
from frappe.model.document import Document


class Enquiry(Document):
	def before_validate(self):
		if self.user_employee:
			return
		#
		employee_doc = get_current_employee()
		self.user_employee = employee_doc.name if employee_doc else None

	def validate(self):
		# Mobile is a Link to Mobile Contact, whose own validate holds it to 10 digits
		self.validate_mobile_customer()

	def validate_mobile_customer(self):
		"""Mobile Customer must be one of this Enquiry's Mobile, and Customer must be its Customer.

		Customer is fetched from Mobile Customer, so the form keeps the two in step. These checks
		hold the same line for imports and the API, which can send the fields in any combination.
		"""
		if not self.mobile_customer:
			# the fetch fills Customer from Mobile Customer, but never clears it
			if self.customer:
				frappe.throw(
					_("Customer must be empty when Mobile Customer is not set: {0}").format(
						frappe.bold(self.customer)
					),
					title=_("Invalid Customer"),
				)
			return
		#
		mobile_customer = frappe.db.get_value(
			"Mobile Contact Customer", self.mobile_customer, ["mobile_contact", "customer"], as_dict=True
		)
		if not mobile_customer:
			frappe.throw(_("Mobile Customer {0} not found.").format(frappe.bold(self.mobile_customer)))
		if mobile_customer.mobile_contact != self.mobile:
			frappe.throw(
				_("Mobile Customer {0} is for Mobile {1}, not {2}.").format(
					frappe.bold(self.mobile_customer),
					frappe.bold(mobile_customer.mobile_contact),
					frappe.bold(self.mobile),
				),
				title=_("Invalid Mobile Customer"),
			)
		if mobile_customer.customer != self.customer:
			frappe.throw(
				_("Customer must be {0}, the Customer of Mobile Customer {1}, not {2}.").format(
					frappe.bold(mobile_customer.customer),
					frappe.bold(self.mobile_customer),
					frappe.bold(self.customer or _("empty")),
				),
				title=_("Invalid Customer"),
			)



@frappe.whitelist()
def get_current_employee():
	employee_doc = None
	if frappe.session.user:
		employee_name = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
		employee_doc = frappe.get_doc("Employee", employee_name) if employee_name else None
	return employee_doc
