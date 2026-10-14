"""Copy the Enquiry's Messages (child DocType Enquiry Message) into the standalone Job Comments.

Runs after the sync (post_model_sync), which has just created the Job Comments table and
dropped the Messages table field from Enquiry -- that removes the field only; the rows
stay in `tabEnquiry Message`, and Enquiry Message itself is kept until the copy is
verified.

Each row keeps its name, so a reply's parent_message value carries over unchanged as
parent_comment and still points at the right comment. The owner and timestamps carry
over too. Rows already copied are skipped, so running it again is safe.
"""

import frappe


def execute():
	# a site that never had Enquiry Message has nothing to copy
	if not frappe.db.table_exists("Enquiry Message", cached=False):
		return

	# should the sync not have created it, fail: a patch that returns is logged as done
	# and never runs again
	if not frappe.db.table_exists("Job Comments", cached=False):
		frappe.throw("Job Comments table is missing; run the model sync before this patch.")

	rows = frappe.get_all(
		"Enquiry Message",
		filters={
			"parenttype": "Enquiry",
			"parentfield": "enquiry_messages",
		},
		fields=["*"],
		order_by="creation asc, idx asc",
	)

	# db_insert() checks nothing, so confirm here that every row gets an Enquiry
	no_enquiry = [row.name for row in rows if not row.parent]
	if no_enquiry:
		frappe.throw(f"Enquiry Message rows without an Enquiry: {', '.join(no_enquiry)}")

	migrated = skipped = 0

	for row in rows:
		# Idempotent: skip rows already copied by an earlier partial run
		if frappe.db.exists("Job Comments", row.name):
			skipped += 1
			continue

		new = frappe.new_doc("Job Comments")
		new.name = row.name  # keep names so parent_message links stay valid
		new.enquiry = row.parent
		new.comment = row.comment
		new.mode = row.mode
		new.parent_comment = row.parent_message
		new.owner = row.owner  # preserve audit fields
		new.creation = row.creation
		new.modified = row.modified
		new.modified_by = row.modified_by
		# db_insert() skips validation, so a parent_comment pointing at a row not yet
		# copied is fine
		new.db_insert()
		migrated += 1

	frappe.db.commit()
	print(f"Job Comments: migrated={migrated}, skipped={skipped}")
