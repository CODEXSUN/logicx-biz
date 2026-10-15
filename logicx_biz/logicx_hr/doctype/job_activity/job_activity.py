import frappe
from frappe.model.document import Document


class JobActivity(Document):
	pass


def add_job_activity(job_type, job_id, activity_details):
	"""Add an auto-generated Job Activity record for a job (an Enquiry, a Task, ...).

	Used by related doctypes (Job Execution, Job Location, Job Attachment, Job Estimate, Job Comments)
	to log activity against the job they belong to.
	"""
	if not job_type or not job_id or not activity_details:
		return
	frappe.get_doc(
		{"doctype": "Job Activity", "job_type": job_type, "job_id": job_id, "activity_details": activity_details}
	).insert(ignore_permissions=True)
