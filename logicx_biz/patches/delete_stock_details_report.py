"""The "Stock Details" report was renamed to "Stock Search" (new standard report
files under logicx_erp/report/stock_search); module sync creates the new doc but
never removes the old one, so the stale "Stock Details" record is deleted here.
"""

import frappe


def execute():
	frappe.delete_doc("Report", "Stock Details", force=True, ignore_missing=True)
