"""Seed the default "Enquiry Group" masters.

`Enquiry.group` ("List in") was a Select with a fixed option list; it is now a
Link to Enquiry Group. The old option values are created here as documents so
existing Enquiry rows keep resolving (the stored value is the group name, which
is also the new docname).

`idx` is set in descending order because the link-field dropdown and the list
view are ordered by `idx desc`, which keeps the picker in the same order the
Select had. Groups added later through the UI get idx 0 and sort last.
"""

import frappe

DEFAULT_GROUPS = [
	"Stores",
	"DELL",
	"ASUS",
	"Spares",
	"MBO",
	"Service",
	"On-site",
	"Remote - AnyDesk",
	"Follow",
	"LogicX",
	"Admin",
]


def execute():
	total = len(DEFAULT_GROUPS)
	for position, group_name in enumerate(DEFAULT_GROUPS):
		create_group(group_name, idx=total - position)

	# Any value already stored on an Enquiry but not in the default list would
	# otherwise become a broken link.
	existing = frappe.db.sql_list(
		"SELECT DISTINCT `group` FROM `tabEnquiry` WHERE IFNULL(`group`, '') != ''"
	)
	for group_name in existing:
		create_group(group_name, idx=0)


def create_group(group_name, idx):
	if frappe.db.exists("Enquiry Group", group_name):
		return
	#
	group_doc = frappe.new_doc("Enquiry Group")
	group_doc.group_name = group_name
	group_doc.idx = idx
	group_doc.insert(ignore_permissions=True)
