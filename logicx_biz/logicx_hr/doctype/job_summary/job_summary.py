import frappe
from frappe.model.document import Document

# a job's counts of Job Comments, Job Activity and Job Execution rows, one Job Summary per
# Job Type and Job ID, kept in step by those three doctypes themselves (see
# update_job_summary); no role may edit them by hand. Per doctype, the Job Summary
# fields it gives and the filters each counts by.
COUNTS = {
	"Job Comments": {"comment_count": {}},
	"Job Activity": {"activity_count": {}},
	"Job Execution": {
		"execution_completed_count": {"status": "Completed"},
		"execution_running_count": {"status": "Running"},
	},
}
COUNT_FIELDS = [fieldname for counts in COUNTS.values() for fieldname in counts]


class JobSummary(Document):
	pass


def update_job_summary(doc):
	"""Recount doc's doctype on its job, and on the job it was on before the save, should it
	have moved.

	Called by Job Comments, Job Activity and Job Execution on insert, on save and on delete.
	They are recounted rather than added to or taken from, so a save that moves a row to
	another job, or a Job Execution from Running to Completed, comes out right too. On
	delete it runs after the row is gone, so the row is out of the count.
	"""
	refresh(doc.doctype, doc.job_type, doc.job_id)
	previous = doc.get_doc_before_save()
	if previous and (previous.job_type, previous.job_id) != (doc.job_type, doc.job_id):
		refresh(doc.doctype, previous.job_type, previous.job_id)


def refresh(doctype, job_type, job_id):
	# a Job Comments row on a Mobile alone has no job, and so no summary
	if not (job_type and job_id):
		return
	merge(job_type, job_id, count(doctype, job_type, job_id))


def count(doctype, job_type, job_id):
	return {
		fieldname: frappe.db.count(doctype, {"job_type": job_type, "job_id": job_id, **filters})
		for fieldname, filters in COUNTS[doctype].items()
	}


def merge(job_type, job_id, counts):
	"""Set counts on the job's Job Summary, inserting it when there is none; counts not
	given stay as they are. A summary whose counts all come to 0 is deleted."""
	job_summary = read_by_job(job_type, job_id)
	if job_summary is None:
		if any(counts.values()):
			insert(job_type, job_id, counts)
	elif not any({**job_summary, **counts}[fieldname] for fieldname in COUNT_FIELDS):
		delete(job_summary)
	else:
		update(job_summary, counts)


def read_by_job(job_type, job_id):
	return frappe.db.get_value(
		"Job Summary",
		{"job_type": job_type, "job_id": job_id},
		["name", *COUNT_FIELDS],
		as_dict=True,
	)


def insert(job_type, job_id, counts):
	# the counts are of rows already on the job, so the job itself is not checked again:
	# rows on a job since deleted, or on the old SOP Job Type, are counted all the same
	frappe.get_doc({"doctype": "Job Summary", "job_type": job_type, "job_id": job_id, **counts}).insert(
		ignore_permissions=True, ignore_links=True
	)


def update(job_summary, counts):
	# most saves leave the counts as they were
	changed = {fieldname: value for fieldname, value in counts.items() if job_summary[fieldname] != value}
	if changed:
		frappe.db.set_value("Job Summary", job_summary.name, changed)


def delete(job_summary):
	# it holds nothing the rows don't, so there is nothing to keep as a Deleted Document
	frappe.db.delete("Job Summary", {"name": job_summary.name})


def on_doctype_update():
	# one Job Summary per Job Type and Job ID
	frappe.db.add_unique("Job Summary", ["job_type", "job_id"])
