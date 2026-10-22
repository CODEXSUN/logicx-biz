"""Fill the empty Titles of the existing Enquiries from their Enquiry Details.

Enquiry's Title is now mandatory, and 250 characters long. So, for each Enquiry with no Title,
set it to its Enquiry Details as one line of plain text, cut to 250 characters.

Runs after the sync (post_model_sync), which widens the title column to 250. Enquiry Details
is a Text Editor, so its HTML is stripped the way the Mobile Dashboard strips it for a table
cell. An Enquiry whose Details are empty too is left for someone to fill, and counted. Plain
UPDATEs, so `modified` and the version history are left alone. Enquiries that already have a
Title are skipped, so running it again is safe.
"""

import frappe

from logicx_biz.logicx_hr.mobile_dashboard import _plain_text

TITLE_LENGTH = 250


def execute():
	rows = frappe.db.sql(
		"SELECT `name`, `enquiry_details` FROM `tabEnquiry` WHERE IFNULL(TRIM(`title`), '') = ''",
		as_dict=True,
	)
	updated, left = 0, []
	for row in rows:
		title = _plain_text(row.enquiry_details)[:TITLE_LENGTH].rstrip()
		if not title:
			left.append(row.name)
			continue
		frappe.db.set_value("Enquiry", row.name, "title", title, update_modified=False)
		updated += 1
	# should be 0, as Enquiry Details is mandatory
	print(f"Enquiry: title set from details={updated}, still without title={len(left)} {left}")
