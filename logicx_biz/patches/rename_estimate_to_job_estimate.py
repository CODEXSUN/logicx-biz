"""Rename the Estimate DocType to Job Estimate.

Its files moved from logicx_hr/doctype/estimate/ to logicx_hr/doctype/job_estimate/
alongside this patch. Left to itself, migrate's sync would create a new, empty Job
Estimate beside the old record, then delete Estimate -- whose controller is gone --
as an orphan, leaving its existing records behind. So the record is renamed here,
before the sync runs (pre_model_sync): rename_doc renames `tabEstimate` to
`tabJob Estimate` and updates whatever names the DocType -- Link fields' options,
and the comments, versions, attachments and customizations recorded against it.
The sync then finds the record under its new name and imports the moved JSON over it.

Document names (ESTIMATE1, ...) and the naming series are unchanged.
"""

import frappe


def execute():
	# skip a site that never had Estimate, or already has Job Estimate
	if frappe.db.exists("DocType", "Estimate") and not frappe.db.exists("DocType", "Job Estimate"):
		frappe.rename_doc("DocType", "Estimate", "Job Estimate", force=True)
