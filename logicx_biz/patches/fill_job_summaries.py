"""Fill the new Job Summary from the existing Job Comments, Job Activity and Job Execution.

Each job (Job Type + Job ID) with rows in any of the three gets a Job Summary: its count of
Job Comments, of Job Activity, and of Job Executions Completed and Running; a Cancelled one is
not counted. From now on the three keep it in step themselves (see
job_summary.update_job_summary). A Job Comments row on a Mobile alone has no job, and so is
not counted either.

Runs after the sync (post_model_sync), which creates the table. A Job Summary already there
is set to the counts afresh, and deleted when they all come to 0, so running it again is safe.
"""

import frappe
from frappe.query_builder.functions import Count

from logicx_biz.logicx_hr.doctype.job_summary.job_summary import COUNT_FIELDS, COUNTS, merge


def execute():
	# every job with a summary or with rows to count; a count with no rows is 0
	jobs = {
		(row.job_type, row.job_id): dict.fromkeys(COUNT_FIELDS, 0)
		for row in frappe.get_all("Job Summary", fields=["job_type", "job_id"])
	}
	for doctype, counts in COUNTS.items():
		for fieldname, filters in counts.items():
			for job_type, job_id, count in count_by_job(doctype, filters):
				jobs.setdefault((job_type, job_id), dict.fromkeys(COUNT_FIELDS, 0))[fieldname] = count

	for (job_type, job_id), counts in jobs.items():
		merge(job_type, job_id, counts)

	print(f"Job Summary: jobs={len(jobs)}, summaries={frappe.db.count('Job Summary')}")


def count_by_job(doctype, filters):
	"""(Job Type, Job ID, count) of each job with rows of doctype matching filters."""
	table = frappe.qb.DocType(doctype)
	# != "" leaves out NULL as well
	query = (
		frappe.qb.from_(table)
		.select(table.job_type, table.job_id, Count("*"))
		.where((table.job_type != "") & (table.job_id != ""))
		.groupby(table.job_type, table.job_id)
	)
	for fieldname, value in filters.items():
		query = query.where(table[fieldname] == value)
	return query.run()
