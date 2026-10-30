"""Fill the new Enquiry Daily Role from the existing Enquiries.

Each Enquiry gets, on its own Date, a Lead Creator row for its Lead By and a Job
Assignee row for its Assigned To. For Job Assignee these are the members the Enquiries
have now, as there is no record of who held the role on any day before; from now on
the Enquiry adds one on the day of each save (see Enquiry.on_update).

Runs after the sync (post_model_sync), which creates the table. An empty Lead By or
Assigned To gives no row. A row already there is left as it is, so running it again
is safe.
"""

import frappe

from logicx_biz.logicx_hr.doctype.enquiry_daily_role.enquiry_daily_role import (
	JOB_ASSIGNEE,
	LEAD_CREATOR,
	insert,
	read_by_enquiry_date_role,
)


def execute():
	enquiries = frappe.get_all(
		"Enquiry",
		fields=["name", "date", "user_employee", "assigned_to_employee"],
		order_by="creation asc",
	)

	inserted = existing = 0
	no_date = []
	for enquiry in enquiries:
		if not enquiry.date:
			no_date.append(enquiry.name)
			continue
		for role, member in (
			(LEAD_CREATOR, enquiry.user_employee),
			(JOB_ASSIGNEE, enquiry.assigned_to_employee),
		):
			if not member:
				continue
			if read_by_enquiry_date_role(enquiry.name, enquiry.date, role):
				existing += 1
				continue
			insert(enquiry.name, enquiry.date, role, member)
			inserted += 1

	# Enquiries without a Date should be 0, as Date is mandatory
	print(
		f"Enquiry Daily Role: inserted={inserted}, already there={existing}, "
		f"Enquiries without a Date={len(no_date)} {no_date}"
	)
