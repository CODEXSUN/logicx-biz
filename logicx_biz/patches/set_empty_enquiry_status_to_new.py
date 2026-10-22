"""Set the empty Statuses of the existing Enquiries to "New".

Enquiry's Status is now mandatory. So each Enquiry with no Status gets "New", the Status a new
Enquiry opens on (its default).

"New" is one of the Enquiry Statuses create_enquiry_statuses seeds; should it have been deleted
since, it is made again first, so no Enquiry is left linking to a Status that does not exist.
One plain UPDATE, so `modified` and the version history are left alone. Enquiries that already
have a Status are skipped, so running it again is safe.
"""

import frappe

from logicx_biz.patches.create_enquiry_statuses import create_status

NEW_STATUS = "New"

# a Status of nothing but spaces reads as empty on the form too
EMPTY_STATUS = "IFNULL(TRIM(`status`), '') = ''"


def execute():
	# a no-op when it is there, as it will be: it was seeded in its own group, "New"
	create_status(NEW_STATUS, "New", idx=0)

	count = frappe.db.sql(f"SELECT COUNT(*) FROM `tabEnquiry` WHERE {EMPTY_STATUS}")[0][0]
	frappe.db.sql(f"UPDATE `tabEnquiry` SET `status` = %s WHERE {EMPTY_STATUS}", (NEW_STATUS,))
	print(f"Enquiry: status set to {NEW_STATUS}={count}")
