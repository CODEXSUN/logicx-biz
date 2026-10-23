"""Rename SOP Item to SOP, SOP Assigned to Duty and SOP Reporting to Duty Reporting.

Their files moved from logicx_hr/doctype/sop_item/, sop_assigned/ and sop_reporting/ to sop/,
duty/ and duty_reporting/ alongside this patch. As in rename_estimate_to_job_estimate, the records
are renamed here, before the sync runs (pre_model_sync), so the sync finds each one under its new
name and imports the moved JSON over it, rather than creating a new, empty DocType and deleting
the old one, records and all, as an orphan. rename_doc renames the tables and updates whatever
names the DocType -- Link fields' options (`sop_item` on Duty and Duty Reporting), and the
comments, versions, attachments and customizations recorded against it.

Duty, not SOP, takes SOP Item's place as a default Job Type, so the "SOP Item" Job Type is replaced
by a "Duty" one at the same place in the picker. Job rows already against "SOP Item" have an SOP as
their Job ID, not a Duty, so they can't move over. With none, the "SOP Item" Job Type is deleted.
Otherwise it is renamed to "SOP", as a Job Type is named after its DocType, which keeps those rows
pointing at their SOP; the patch prints how many there are.

Document names (SOP-12, ASSIGN7, REPORTING222, ...) and the naming series are unchanged.
"""

import frappe

from logicx_biz.patches.create_job_types import create_job_type

RENAMED_DOCTYPES = {
	"SOP Item": "SOP",
	"SOP Assigned": "Duty",
	"SOP Reporting": "Duty Reporting",
}

# the doctypes that name their job through job_type + job_id
JOB_DOCTYPES = (
	"Job Activity",
	"Job Attachment",
	"Job Comments",
	"Job Estimate",
	"Job Execution",
	"Job Location",
)


def execute():
	for old, new in RENAMED_DOCTYPES.items():
		# skip a site that never had the old DocType, or already has the new one
		if frappe.db.exists("DocType", old) and not frappe.db.exists("DocType", new):
			frappe.rename_doc("DocType", old, new, force=True)

	# a site without Job Types yet gets Duty from create_job_types, after the sync
	if frappe.db.table_exists("Job Type") and frappe.db.exists("Job Type", "SOP Item"):
		replace_sop_item_job_type()


def replace_sop_item_job_type():
	idx = frappe.db.get_value("Job Type", "SOP Item", "idx")
	job_rows = sum(frappe.db.count(doctype, {"job_type": "SOP Item"}) for doctype in JOB_DOCTYPES)
	if job_rows:
		# Job Type has allow_rename off, hence force
		frappe.rename_doc("Job Type", "SOP Item", "SOP", force=True)
		print(f"Job Type: renamed SOP Item to SOP, kept for {job_rows} job rows against an SOP")
	else:
		frappe.delete_doc("Job Type", "SOP Item", ignore_permissions=True, force=True)
		print("Job Type: deleted SOP Item, no job rows against it")
	create_job_type("Duty", idx=idx)
