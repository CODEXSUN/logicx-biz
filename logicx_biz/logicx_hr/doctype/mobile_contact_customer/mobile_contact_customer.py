import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_link_to_form


class MobileContactCustomer(Document):
	def validate(self):
		self.validate_duplicate()

	def validate_duplicate(self):
		"""A Mobile Contact is linked to a Customer only once."""
		duplicate = frappe.db.exists(
			"Mobile Contact Customer",
			{"mobile_contact": self.mobile_contact, "customer": self.customer, "name": ["!=", self.name]},
		)
		if duplicate:
			frappe.throw(
				_("{0} is already linked to {1}: {2}").format(
					frappe.bold(self.mobile_contact),
					frappe.bold(self.customer_name or self.customer),
					get_link_to_form("Mobile Contact Customer", duplicate),
				),
				frappe.DuplicateEntryError,
				title=_("Duplicate Mobile Contact Customer"),
			)


def update_customer_name(doc, method=None, *args):
	"""doc_events hook on Customer: carry its current customer_name onto its Mobile Contact Customer rows.

	Runs on on_update, when the name is edited, and on after_rename, where ERPNext sets
	customer_name with db_set (Customers named by Customer Name) and on_update never runs.
	"""
	if method == "on_update" and not doc.has_value_changed("customer_name"):
		return
	customer_name = frappe.db.get_value("Customer", doc.name, "customer_name")
	frappe.db.set_value(
		"Mobile Contact Customer", {"customer": doc.name}, "customer_name", customer_name, update_modified=False
	)


def on_doctype_update():
	# the database's own guard for one row per Mobile Contact and Customer,
	# should two saves race past validate_duplicate
	frappe.db.add_unique("Mobile Contact Customer", ["mobile_contact", "customer"])
