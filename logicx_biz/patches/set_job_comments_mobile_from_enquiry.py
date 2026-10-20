"""Fill Mobile on the existing Job Comments from their Enquiry.

Job Comments has a new read-only Mobile field, a Link to Mobile Contact. Each save sets it to
the Enquiry's Mobile when Job Type is "Enquiry", and clears it for other Job Types. So, for the
existing rows with Job Type "Enquiry", copy the Enquiry's Mobile.

Runs after the sync (post_model_sync), which adds the mobile column. Only a Mobile that has a
Mobile Contact is copied: an Enquiry Mobile that failed the 10-digit check in
set_enquiry_mobile_customer has none, and would be a broken Link. Plain UPDATE, so `modified`
and the version history are left alone. Rows that already have a Mobile are skipped, so
running it again is safe.
"""

import frappe


def execute():
	pending = frappe.db.count("Job Comments", {"job_type": "Enquiry", "mobile": ["is", "not set"]})
	frappe.db.sql(
		"""
		UPDATE `tabJob Comments` jc
		JOIN `tabEnquiry` e ON e.`name` = jc.`job_id`
		JOIN `tabMobile Contact` mc ON mc.`name` = e.`mobile`
		SET jc.`mobile` = e.`mobile`
		WHERE jc.`job_type` = 'Enquiry' AND IFNULL(jc.`mobile`, '') = ''
		"""
	)
	# should be 0, unless an Enquiry is missing or its Mobile has no Mobile Contact
	left = frappe.db.count("Job Comments", {"job_type": "Enquiry", "mobile": ["is", "not set"]})
	print(f"Job Comments: mobile set from enquiry={pending - left}, still without mobile={left}")
