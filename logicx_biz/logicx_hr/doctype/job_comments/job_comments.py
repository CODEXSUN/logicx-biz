import frappe
from frappe.model.document import Document

from logicx_biz.logicx_hr.doctype.job_activity.job_activity import add_job_activity

TRIGGER_FIELDS = ("job_type", "job_id", "comment")


class JobComments(Document):
	def validate(self):
		self.set_mobile()

	def set_mobile(self):
		"""Mobile is the Enquiry's Mobile; other Job Types have none.

		Job ID is a Dynamic Link, which fetch_from cannot follow, so it is fetched here.
		"""
		if self.job_type == "Enquiry" and self.job_id:
			self.mobile = frappe.db.get_value("Enquiry", self.job_id, "mobile")
		else:
			self.mobile = None

	def on_update(self):
		if any(self.has_value_changed(fieldname) for fieldname in TRIGGER_FIELDS):
			self.post_job_activity()

	def post_job_activity(self):
		add_job_activity(self.job_type, self.job_id, self.comment, self.doctype, self.name)
