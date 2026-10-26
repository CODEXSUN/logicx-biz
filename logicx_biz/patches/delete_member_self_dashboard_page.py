"""The "Member Self Dashboard" page was renamed to "My Member Dashboard" (new
standard page files under logicx_hr/page/my_member_dashboard); module sync
creates the new doc but never removes the old one, so the stale
"member-self-dashboard" record is deleted here.
"""

import frappe


def execute():
	frappe.delete_doc("Page", "member-self-dashboard", force=True, ignore_missing=True)
