"""Rename the `user` field on Duty and Duty Reporting to `employee`, labelled Employee.

The field links to Employee, not User, so it takes the Employee's name. The sync adds the
`employee` column and leaves the old `user` one in place, values and all, so this runs after it
(post_model_sync). rename_field copies `user` into `employee` on every row, and points saved
reports, list view columns, user settings and property setters at the new field. It skips, with
a printed note, a doctype that has no `user` column, as on a fresh install.

The old `user` column is left behind, unused. API clients now send and read `employee`.
"""

from frappe.model.utils.rename_field import rename_field


def execute():
	for doctype in ("Duty", "Duty Reporting"):
		rename_field(doctype, "user", "employee")
