from frappe.model.document import Document

from logicx_biz.logicx_hr.doctype.job_activity.job_activity import add_job_activity

TRIGGER_FIELDS = ("job_type", "job_id", "comment")


class JobComments(Document):
	def on_update(self):
		if any(self.has_value_changed(fieldname) for fieldname in TRIGGER_FIELDS):
			self.post_job_activity()

	def post_job_activity(self):
		add_job_activity(self.job_type, self.job_id, self.comment)
