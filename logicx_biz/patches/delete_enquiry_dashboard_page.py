"""The "Enquiry Dashboard" page was renamed to "Mobile Dashboard" (new standard
page files under logicx_hr/page/mobile_dashboard); module sync creates the new
doc but never removes the old one, so the stale "enquiry-dashboard" record is
deleted here.
"""

import frappe


def execute():
	frappe.delete_doc("Page", "enquiry-dashboard", force=True, ignore_missing=True)
