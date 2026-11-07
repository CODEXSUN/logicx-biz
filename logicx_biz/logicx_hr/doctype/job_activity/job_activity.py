import frappe
from frappe.model.document import Document

from logicx_biz.logicx_hr.doctype.enquiry.enquiry import open_on_job_activity
from logicx_biz.logicx_hr.doctype.job_summary.job_summary import update_job_summary

# the fields its count in Job Summary goes by
SUMMARY_FIELDS = ("job_type", "job_id")


class JobActivity(Document):
	def on_update(self):
		# on insert too, when every field counts as changed
		if any(self.has_value_changed(fieldname) for fieldname in SUMMARY_FIELDS):
			update_job_summary(self)
			if self.job_type == "Enquiry":
				open_on_job_activity(self.job_id)

	def after_delete(self):
		update_job_summary(self)


def add_job_activity(job_type, job_id, activity_details, job_activity_type, job_activity_id):
	"""Add an auto-generated Job Activity record for a job (an Enquiry, a Task, ...).

	Used by related doctypes (Job Execution, Job Location, Job Attachment, Job Estimate, Job Comments)
	to log activity against the job they belong to. `job_activity_type` / `job_activity_id` name the
	record that posted it, e.g. "Job Execution" / "JOBEXE7".
	"""
	if not job_type or not job_id or not activity_details:
		return
	frappe.get_doc(
		{
			"doctype": "Job Activity",
			"job_type": job_type,
			"job_id": job_id,
			"job_activity_type": job_activity_type,
			"job_activity_id": job_activity_id,
			"activity_details": activity_details,
		}
	).insert(ignore_permissions=True)
