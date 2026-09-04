"""The "Stock Details Search" report was renamed to "Stock Search Detailed" (new
standard report files under logicx_erp/report/stock_search_detailed); module sync
creates the new doc but never removes the old one, so the stale "Stock Details
Search" record is deleted here.
"""

import frappe


def execute():
	frappe.delete_doc("Report", "Stock Details Search", force=True, ignore_missing=True)
