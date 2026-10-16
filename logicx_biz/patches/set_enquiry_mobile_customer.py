"""Back each Enquiry's Mobile and Customer with a Mobile Contact and a Mobile Contact Customer.

Enquiry's Mobile is now a Link to Mobile Contact, and its Customer is fetched from the new
Mobile Customer field, a Link to Mobile Contact Customer. Enquiry.validate requires Mobile
Customer to belong to the Enquiry's Mobile and to carry its Customer, and Customer to be empty
without one. So, for the existing Enquiries:

1. trim Mobile, which a Link has to match exactly;
2. create a Mobile Contact for each Mobile that has none;
3. create a Mobile Contact Customer for each Mobile + Customer pair that has none;
4. set Mobile Customer on each Enquiry that has a Customer.

Runs after the sync (post_model_sync), which adds the mobile_customer column and creates the
Mobile Contact tables. Mobile Contacts and Mobile Contact Customers are inserted as documents,
so the 10-digit check and the duplicate check run on them. A Mobile that fails the check gets
no Mobile Contact: it is printed, and its Enquiries are left for someone to correct. The
Enquiry updates are plain UPDATEs, so `modified` and the version history are left alone.
Anything that already exists is skipped, so running it again is safe.
"""

import frappe


def execute():
	# a Link has to match its target's name exactly; older Enquiries may predate the trim in validate
	frappe.db.sql("UPDATE `tabEnquiry` SET `mobile` = TRIM(`mobile`) WHERE `mobile` != TRIM(`mobile`)")

	create_mobile_contacts()
	create_mobile_contact_customers()
	set_mobile_customer()


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


def create_mobile_contact_customers():
	"""Create a Mobile Contact Customer for each Enquiry Mobile + Customer pair that has none."""
	pairs = frappe.db.sql(
		"""
		SELECT DISTINCT e.`mobile`, e.`customer`
		FROM `tabEnquiry` e
		JOIN `tabMobile Contact` mc ON mc.`name` = e.`mobile`
		WHERE IFNULL(e.`customer`, '') != ''
		""",
		as_dict=True,
	)
	created, failed = 0, []
	for pair in pairs:
		if frappe.db.exists("Mobile Contact Customer", {"mobile_contact": pair.mobile, "customer": pair.customer}):
			continue
		try:
			frappe.get_doc(
				{"doctype": "Mobile Contact Customer", "mobile_contact": pair.mobile, "customer": pair.customer}
			).insert(ignore_permissions=True)
			created += 1
		except frappe.ValidationError:
			# e.g. a Customer that no longer exists fails the link check
			failed.append(f"{pair.mobile} - {pair.customer}")
	print(f"Mobile Contact Customer: created={created}, failed={len(failed)} {failed}")


def set_mobile_customer():
	"""Point each Enquiry that has a Customer at the Mobile Contact Customer of its Mobile and Customer."""
	pending = frappe.db.count("Enquiry", {"customer": ["is", "set"], "mobile_customer": ["is", "not set"]})
	frappe.db.sql(
		"""
		UPDATE `tabEnquiry` e
		JOIN `tabMobile Contact Customer` mcc
			ON mcc.`mobile_contact` = e.`mobile` AND mcc.`customer` = e.`customer`
		SET e.`mobile_customer` = mcc.`name`
		WHERE IFNULL(e.`customer`, '') != '' AND IFNULL(e.`mobile_customer`, '') = ''
		"""
	)
	# should be 0, unless a Mobile failed the 10-digit check or a pair failed above
	left = frappe.db.count("Enquiry", {"customer": ["is", "set"], "mobile_customer": ["is", "not set"]})
	print(f"Enquiry: mobile customer set={pending - left}, still without mobile customer={left}")
