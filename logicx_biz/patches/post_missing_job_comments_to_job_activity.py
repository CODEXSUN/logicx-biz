"""Copy into Job Activity the Job Comments rows that copy_job_comments_to_job_activity missed.

That patch took a row as copied already when a Job Activity on its job had the same creation
time. But the rows migrate_enquiry_messages_to_job_comments brought over from the Enquiry's
Messages mostly share one creation time, the Enquiry's: Frappe gives a child row added to a
saved parent the parent's creation. So only the first comment on each such Enquiry was copied,
and the rest were skipped.

This time a row counts as posted when a Job Activity on its job points back at it (Job
Activity Type "Job Comments", Job Activity ID the row's name), which every copy and every
Job Comments save since does. Each row with none is copied as that patch copies it: same Job
Type, Job ID and text, the owner and timestamps of its row. A comment on a Mobile alone has no
job, and an empty comment nothing to post, so neither is copied. Only Job Comments rows are
looked at; the Job Comments rows themselves stay as they are.

Copied rows count on their job's Job Summary, so each job given one is recounted. Running it
again finds nothing missing, so it is safe.
"""

import frappe

from logicx_biz.logicx_hr.doctype.job_summary.job_summary import refresh


def execute():
	rows = frappe.db.sql(
		"""
		SELECT jc.`name`, jc.`job_type`, jc.`job_id`, jc.`comment`,
			jc.`owner`, jc.`creation`, jc.`modified`, jc.`modified_by`
		FROM `tabJob Comments` jc
		WHERE IFNULL(jc.`job_type`, '') != '' AND IFNULL(jc.`job_id`, '') != ''
			AND IFNULL(jc.`comment`, '') != ''
			AND NOT EXISTS (
				SELECT 1 FROM `tabJob Activity` ja
				WHERE ja.`job_activity_type` = 'Job Comments' AND ja.`job_activity_id` = jc.`name`
					AND ja.`job_type` = jc.`job_type` AND ja.`job_id` = jc.`job_id`
			)
		ORDER BY jc.`creation` ASC
		""",
		as_dict=True,
	)

	for row in rows:
		activity = frappe.new_doc("Job Activity")
		activity.job_type = row.job_type
		activity.job_id = row.job_id
		activity.job_activity_type = "Job Comments"
		activity.job_activity_id = row.name
		activity.activity_details = row.comment
		activity.owner = row.owner  # preserve audit fields
		activity.creation = row.creation
		activity.modified = row.modified
		activity.modified_by = row.modified_by
		activity.set_new_name()
		# db_insert() skips validation and hooks, so nothing new is posted and the timestamps stay
		activity.db_insert()

	# db_insert() skipped the Job Summary update too
	jobs = {(row.job_type, row.job_id) for row in rows}
	for job_type, job_id in jobs:
		refresh("Job Activity", job_type, job_id)

	frappe.db.commit()
	print(f"Job Comments -> Job Activity: copied={len(rows)}, jobs={len(jobs)}")
