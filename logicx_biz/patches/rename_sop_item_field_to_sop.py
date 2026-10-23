"""Rename the `sop_item` field on Duty and Duty Reporting to `sop`.

The field links to SOP, which was SOP Item until rename_sop_doctypes, so it now takes SOP's name.
The sync adds the `sop` column and leaves the old `sop_item` one in place, values and all, so this
runs after it (post_model_sync). rename_field copies `sop_item` into `sop` on every row, and points
saved reports, list view columns, user settings and property setters at the new field. It skips,
with a printed note, a doctype that has no `sop_item` column, as on a fresh install.

The old `sop_item` column is left behind, unused. API clients now send and read `sop`.
"""

from frappe.model.utils.rename_field import rename_field


def execute():
	for doctype in ("Duty", "Duty Reporting"):
		rename_field(doctype, "sop_item", "sop")
