import frappe
from frappe.model.document import Document
from frappe.utils import formatdate

from logicx_biz.logicx_hr.doctype.enquiry.enquiry import add_enquiry_message

TRIGGER_FIELDS = ("item_name", "supplier", "date")


class Estimate(Document):
	def on_update(self):
		if any(self.has_value_changed(fieldname) for fieldname in TRIGGER_FIELDS):
			self.post_enquiry_message()

	def post_enquiry_message(self):
		if not self.enquiry:
			return

		supplier_name = frappe.get_cached_value("Supplier", self.supplier, "supplier_name") or self.supplier
		comment = f"Estimate for {self.item_name} is received from {supplier_name} on {formatdate(self.date)}"
		add_enquiry_message(self.enquiry, comment)
