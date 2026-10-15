import frappe
from frappe.model.document import Document
from frappe.utils import formatdate

from logicx_biz.logicx_hr.doctype.enquiry.enquiry import add_job_comments

TRIGGER_FIELDS = ("item_name", "supplier", "date")


class JobEstimate(Document):
	def on_update(self):
		if any(self.has_value_changed(fieldname) for fieldname in TRIGGER_FIELDS):
			self.post_job_comments()

	def post_job_comments(self):
		if not self.job_id:
			return

		supplier_name = frappe.get_cached_value("Supplier", self.supplier, "supplier_name") or self.supplier
		comment = f"Estimate for {self.item_name} is received from {supplier_name} on {formatdate(self.date)}"
		add_job_comments(self.job_type, self.job_id, comment)
