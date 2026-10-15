"""Fill Job Type / Job ID from Enquiry on the job doctypes.

Job Attachment, Job Comments, Job Estimate, Job Execution and Job Location now say which
job they belong to through Job Type + Job ID (a Dynamic Link). Their Enquiry field stays
for now. Every existing row belonged to an Enquiry, so it gets Job Type "Enquiry" and its
Enquiry as Job ID.

Runs after the sync (post_model_sync), which adds the two columns, and after
create_job_types, which makes the "Enquiry" Job Type. Plain UPDATEs, so `modified` and the
version history are left alone. Rows that already have a Job ID are skipped, so running it
again is safe.
"""

import frappe

JOB_DOCTYPES = ("Job Attachment", "Job Comments", "Job Estimate", "Job Execution", "Job Location")


def execute():
	for doctype in JOB_DOCTYPES:
		pending = frappe.db.count(doctype, {"enquiry": ["is", "set"], "job_id": ["is", "not set"]})
		frappe.db.sql(
			f"""
			UPDATE `tab{doctype}`
			SET `job_type` = 'Enquiry', `job_id` = `enquiry`
			WHERE IFNULL(`enquiry`, '') != '' AND IFNULL(`job_id`, '') = ''
			"""
		)
		# should be 0: Enquiry was mandatory until now
		left_without_job = frappe.db.count(doctype, {"job_id": ["is", "not set"]})
		print(f"{doctype}: job set from enquiry={pending}, still without job={left_without_job}")
