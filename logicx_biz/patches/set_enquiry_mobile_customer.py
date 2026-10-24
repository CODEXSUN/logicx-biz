"""Back each Enquiry's Mobile with a Mobile Contact.

Enquiry's Mobile is a Link to Mobile Contact. So, for the existing Enquiries:

1. trim Mobile, which a Link has to match exactly;
2. create a Mobile Contact for each Mobile that has none.

Named for the Mobile Customer field it also filled, from 0.1.76, through Mobile Contact Customer
rows it created. Both were removed in 0.1.94, and so were those two steps.

Runs after the sync (post_model_sync), which creates the Mobile Contact table. Mobile Contacts
are inserted as documents, so the 10-digit check runs on them. A Mobile that fails the check
gets no Mobile Contact: it is printed, and its Enquiries are left for someone to correct. The
trim is a plain UPDATE, so `modified` and the version history are left alone. Anything that
already exists is skipped, so running it again is safe.
"""

import frappe


def execute():
	# a Link has to match its target's name exactly; older Enquiries may predate the trim in validate
	frappe.db.sql("UPDATE `tabEnquiry` SET `mobile` = TRIM(`mobile`) WHERE `mobile` != TRIM(`mobile`)")

	create_mobile_contacts()


def create_mobile_contacts():
	"""Create a Mobile Contact for each Enquiry Mobile that has none."""
	mobiles = frappe.db.sql_list("SELECT DISTINCT `mobile` FROM `tabEnquiry` WHERE IFNULL(`mobile`, '') != ''")
	created, invalid = 0, []
	for mobile in mobiles:
		if frappe.db.exists("Mobile Contact", mobile):
			continue
		try:
			frappe.get_doc({"doctype": "Mobile Contact", "mobile_number": mobile}).insert(ignore_permissions=True)
			created += 1
		except frappe.ValidationError:
			# not 10 digits: validate throws before anything is written
			invalid.append(mobile)
	print(f"Mobile Contact: created={created}, invalid mobiles={len(invalid)} {invalid}")
