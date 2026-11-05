"""Copy each Duty Reporting's Actions into a Job Comments row against that Duty Reporting.

logicx-front doesn't use or show the Actions field, so what has been reported in it is copied to
Job Comments. Each copy has Job Type "Duty Reporting", Job ID its Duty Reporting and the Actions as
its comment, and keeps the Duty Reporting's owner and timestamps. The Duty Reporting rows themselves
stay as they are, Actions included.

Saving a Job Comments row posts it to Job Activity and recounts the job's Job Summary, but the rows
go in with db_insert(), which skips those hooks so that the timestamps stay. So this does both too:
a Job Activity pointing back at the new row, as post_missing_job_comments_to_job_activity makes, and
a recount of both on each job.

A Duty Reporting whose Actions are already a comment on it is skipped, so running it again is safe.

Runs after replace_duty_job_type_with_duty_reporting, which creates the "Duty Reporting" Job Type.
"""

import frappe

from logicx_biz.logicx_hr.doctype.job_summary.job_summary import refresh

JOB_TYPE = "Duty Reporting"


def execute():
	# oldest first, so the JOBCOM.# and JOBACT.# numbers follow the timeline
	rows = frappe.db.sql(
		"""
		SELECT dr.`name`, dr.`actions`, dr.`owner`, dr.`creation`, dr.`modified`, dr.`modified_by`
		FROM `tabDuty Reporting` dr
		WHERE IFNULL(dr.`actions`, '') != ''
			AND NOT EXISTS (
				SELECT 1 FROM `tabJob Comments` jc
				WHERE jc.`job_type` = %s AND jc.`job_id` = dr.`name` AND jc.`comment` = dr.`actions`
			)
		ORDER BY dr.`creation` ASC
		""",
		(JOB_TYPE,),
		as_dict=True,
	)

	for row in rows:
		comment = insert_copy(row, "Job Comments", comment=row.actions)
		insert_copy(
			row,
			"Job Activity",
			job_activity_type="Job Comments",
			job_activity_id=comment.name,
			activity_details=row.actions,
		)
		refresh("Job Comments", JOB_TYPE, row.name)
		refresh("Job Activity", JOB_TYPE, row.name)

	frappe.db.commit()
	print(f"Duty Reporting Actions -> Job Comments: copied={len(rows)}")


def insert_copy(row, doctype, **fields):
	"""Insert a doctype row against row's Duty Reporting, with row's owner and timestamps."""
	doc = frappe.new_doc(doctype)
	doc.job_type = JOB_TYPE
	doc.job_id = row.name
	doc.update(fields)
	doc.owner = row.owner  # preserve audit fields
	doc.creation = row.creation
	doc.modified = row.modified
	doc.modified_by = row.modified_by
	doc.set_new_name()
	# db_insert() skips validation and hooks, so nothing else is posted and the timestamps stay
	doc.db_insert()
	return doc
