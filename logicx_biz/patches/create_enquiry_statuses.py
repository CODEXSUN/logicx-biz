"""Seed the default "Enquiry Status" masters.

`Enquiry.status` was a Select with a fixed option list; it is now a Link to
Enquiry Status. The old option values are created here as documents so existing
Enquiry rows keep resolving (the stored value is the status name, which is also
the new docname).

Each status also carries a `status_group`, the coarse bucket it belongs to.
"Closed" is new -- it was not one of the Select options -- and is seeded
alongside the old values.

`idx` is set in descending order because the link-field dropdown and the list
view are ordered by `idx desc`, which keeps the picker in the same order the
Select had. Statuses added later through the UI get idx 0 and sort last.
"""

import frappe

DEFAULT_STATUSES = [
	("New", "New"),
	("Open", "Pending"),
	("Hold for Approval", "Hold"),
	("Hold for Spares", "Hold"),
	("Hold for Job-Out", "Hold"),
	("Long Hold", "New"),
	("Escalation", "New"),
	("Won", "Closed"),
	("Lost", "Closed"),
	("Closed", "Closed"),
	("Re-open", "New"),
]


def execute():
	total = len(DEFAULT_STATUSES)
	for position, (status_name, status_group) in enumerate(DEFAULT_STATUSES):
		create_status(status_name, status_group, idx=total - position)

	# Any value already stored on an Enquiry but not in the default list would
	# otherwise become a broken link.
	existing = frappe.db.sql_list(
		"SELECT DISTINCT `status` FROM `tabEnquiry` WHERE IFNULL(`status`, '') != ''"
	)
	for status_name in existing:
		create_status(status_name, "New", idx=0)


def create_status(status_name, status_group, idx):
	if frappe.db.exists("Enquiry Status", status_name):
		return
	#
	status_doc = frappe.new_doc("Enquiry Status")
	status_doc.status_name = status_name
	status_doc.status_group = status_group
	status_doc.idx = idx
	status_doc.insert(ignore_permissions=True)
