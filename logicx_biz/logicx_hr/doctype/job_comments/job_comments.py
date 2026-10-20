import frappe
from frappe import _
from frappe.model.document import Document

from logicx_biz.logicx_hr.doctype.job_activity.job_activity import add_job_activity

TRIGGER_FIELDS = ("job_type", "job_id", "comment")


class JobComments(Document):
	def validate(self):
		self.set_mobile()
		self.validate_job_or_mobile()

	def set_mobile(self):
		"""Mobile is the Enquiry's Mobile; other Job Types have none. A comment on no job
		is on the Mobile it was given, which is kept.

		Job ID is a Dynamic Link, which fetch_from cannot follow, so it is fetched here.
		"""
		if self.job_type == "Enquiry" and self.job_id:
			self.mobile = frappe.db.get_value("Enquiry", self.job_id, "mobile")
		elif self.job_type or self.job_id:
			self.mobile = None

	def validate_job_or_mobile(self):
		"""A comment is on a job -- Job Type and Job ID both -- or, with neither, on a Mobile.

		Which is why none of the three is reqd in the DocType; the form marks whichever
		is needed (see job_comments.js).
		"""
		if not (self.job_type or self.job_id):
			if not self.mobile:
				frappe.throw(_("Either Mobile, or Job Type and Job ID, is required"))
			return

		if not (self.job_type and self.job_id):
			frappe.throw(_("Job Type and Job ID are both required for a comment on a job"))

	def on_update(self):
		if any(self.has_value_changed(fieldname) for fieldname in TRIGGER_FIELDS):
			self.post_job_activity()

	def post_job_activity(self):
		# a comment on a Mobile alone has no job, and so no timeline to post to
		add_job_activity(self.job_type, self.job_id, self.comment, self.doctype, self.name)
