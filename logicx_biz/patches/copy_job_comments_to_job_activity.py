"""Copy every Job Comments row into Job Activity.

Job Activity is now a job's full timeline: Job Execution, Job Location, Job Attachment and Job
Estimate post their auto-generated rows ("Job Started by ...", "Location captured by ...") there,
and every Job Comments save posts the comment there too. Before, the auto-generated rows went to
Job Comments (and before that to the Enquiry's Messages, which
migrate_enquiry_messages_to_job_comments copied into Job Comments). So every existing row is
copied: people's comments, replies and auto-generated rows alike. Each copy is a Job Activity with
the same Job Type, Job ID and text, points back at its row (Job Activity Type "Job Comments",
Job Activity ID the row's name), and keeps the owner and timestamps of its row. The Job Comments
rows themselves stay as they are.

A row whose copy already exists (same Job Type, Job ID and creation time) is skipped, so running
it again is safe.

Runs after the sync (post_model_sync), which creates the Job Activity table, and after
set_job_type_and_id_from_enquiry, which gives the old rows their Job Type / Job ID.
"""

import frappe


def execute():
	# should the sync not have created it, fail: a patch that returns is logged as done
	# and never runs again
	if not frappe.db.table_exists("Job Activity", cached=False):
		frappe.throw("Job Activity table is missing; run the model sync before this patch.")

	# an empty comment has nothing to copy, as add_job_activity() posts nothing for one either
	rows = frappe.get_all(
		"Job Comments",
		filters={"comment": ["is", "set"]},
		fields=["name", "job_type", "job_id", "comment", "owner", "creation", "modified", "modified_by"],
		order_by="creation asc",
	)

	copied = skipped = without_job = 0

	for row in rows:
		# Job Activity needs both; should be none, as set_job_type_and_id_from_enquiry filled them
		if not row.job_type or not row.job_id:
			without_job += 1
			continue
		# Idempotent: skip rows already copied by an earlier run
		if frappe.db.exists(
			"Job Activity", {"job_type": row.job_type, "job_id": row.job_id, "creation": row.creation}
		):
			skipped += 1
			continue

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
		# rows go oldest first, so the JOBACT.# numbers follow the timeline
		activity.set_new_name()
		# db_insert() skips validation and hooks, so nothing new is posted and the timestamps stay
		activity.db_insert()
		copied += 1

	frappe.db.commit()
	print(f"Job Comments -> Job Activity: copied={copied}, skipped={skipped}, without job={without_job}")
