"""Replace the "Duty" default Job Type with "Duty Reporting".

"Duty Reporting" takes "Duty"'s place as a default Job Type, at the same idx in the picker, and the
Activity button moves from the Duty form to the Duty Reporting one (public/js/job_activity_menu.js).

Rows already against "Duty" have a Duty as their Job ID, not a Duty Reporting, so they can't move
over. With none, the "Duty" Job Type is deleted. Otherwise it is kept, out of the picker, so those
rows still point at their Duty; the patch prints how many there are.

A site with no "Duty" Job Type, as on a fresh install, gets "Duty Reporting" from create_job_types.
"""

import frappe

from logicx_biz.patches.create_job_types import create_job_type

# the doctypes that name their job through job_type + job_id, and Job Summary, kept per job
JOB_DOCTYPES = (
	"Job Activity",
	"Job Attachment",
	"Job Comments",
	"Job Estimate",
	"Job Execution",
	"Job Location",
	"Job Summary",
)


def execute():
	if not frappe.db.exists("Job Type", "Duty"):
		return

	idx = frappe.db.get_value("Job Type", "Duty", "idx")
	job_rows = sum(frappe.db.count(doctype, {"job_type": "Duty"}) for doctype in JOB_DOCTYPES)
	if job_rows:
		print(f"Job Type: kept Duty for {job_rows} rows against a Duty")
	else:
		frappe.delete_doc("Job Type", "Duty", ignore_permissions=True, force=True)
		print("Job Type: deleted Duty, no rows against it")
	create_job_type("Duty Reporting", idx=idx)
