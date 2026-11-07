"""Set the "New" Enquiries that have at least one Job Activity to "Open".

A Job Activity now moves its Enquiry to Open as it is added (JobActivity.on_update). This brings
the Enquiries that got theirs before that into line. Enquiries on "Re-open" stay as they are.

"Open" is one of the Enquiry Statuses create_enquiry_statuses seeds; should it have been deleted
since, it is made again first, so no Enquiry is left linking to a Status that does not exist.
One plain UPDATE, so `modified` and the version history are left alone. Running it again finds
nothing left to move, so it is safe.
"""

import frappe

from logicx_biz.patches.create_enquiry_statuses import create_status

NEW_STATUS = "New"
OPEN_STATUS = "Open"

NEW_WITH_JOB_ACTIVITY = """
	`status` = %s AND EXISTS (
		SELECT 1 FROM `tabJob Activity` ja
		WHERE ja.`job_type` = 'Enquiry' AND ja.`job_id` = `tabEnquiry`.`name`
	)
"""


def execute():
	# a no-op when it is there, as it will be: it was seeded in the group "Pending"
	create_status(OPEN_STATUS, "Pending", idx=0)

	count = frappe.db.sql(
		f"SELECT COUNT(*) FROM `tabEnquiry` WHERE {NEW_WITH_JOB_ACTIVITY}", (NEW_STATUS,)
	)[0][0]
	frappe.db.sql(
		f"UPDATE `tabEnquiry` SET `status` = %s WHERE {NEW_WITH_JOB_ACTIVITY}", (OPEN_STATUS, NEW_STATUS)
	)
	print(f"Enquiry: status {NEW_STATUS} -> {OPEN_STATUS}={count}")
