"""Server side of the BRS Dashboard's Transaction tab (brs_transaction_report.js, beside this).

The tab is a report of BRS Transactions, narrowed by three filters: a Bank Account,
a Date, and a Search through Reference Number and Description. ``get_transactions``
answers it. ``bank_account_query`` is the search behind its Bank Account filter.

Nothing is written here. A transaction is read with the user's own permissions on
BRS Transaction, the way its list view reads it.
"""

import frappe
from frappe import _
from frappe.utils import cstr, getdate

TRANSACTION_DOCTYPE = "BRS Transaction"

# what a row of the report carries: the six columns the tab shows, and the name of
# the transaction, which is what a click on the row opens
FIELDS = ("name", "bank_account", "date", "deposit", "withdrawal", "reference_number", "description")

# the most rows one answer carries. With no Bank Account or Date picked the report
# is every account's whole history, which is no table to read; past this many,
# the page says so and asks for a narrower filter.
ROW_LIMIT = 500

# newest first, so that the limit keeps the latest transactions rather than the
# oldest. The rows are turned round before they go back: a statement reads oldest
# first, and within one account's day in the order the bank printed it, which is
# the order the day's transactions were numbered in (brs_transaction.py after_insert).
LATEST_FIRST = "date desc, bank_account desc, daily_roll_number desc"


@frappe.whitelist()
def get_transactions(bank_account=None, date=None, search=None):
	"""The BRS Transactions that match the tab's filters, oldest first.

	A filter left blank does not narrow anything. Search matches Reference Number
	or Description, anywhere in either. Answers with the rows, and whether there
	were more than ROW_LIMIT of them -- in which case the rows are the latest
	ROW_LIMIT.
	"""
	filters = {}
	if bank_account:
		filters["bank_account"] = bank_account
	if date:
		filters["date"] = getdate(date)

	or_filters = None
	search = cstr(search).strip()
	if search:
		pattern = f"%{search}%"
		or_filters = {"reference_number": ["like", pattern], "description": ["like", pattern]}

	# one row past the limit, which is only how it is known whether there are more
	rows = frappe.get_list(
		TRANSACTION_DOCTYPE,
		fields=list(FIELDS),
		filters=filters,
		or_filters=or_filters,
		order_by=LATEST_FIRST,
		limit=ROW_LIMIT + 1,
	)
	more = len(rows) > ROW_LIMIT
	rows = rows[:ROW_LIMIT]
	rows.reverse()
	return {"rows": rows, "more": more, "limit": ROW_LIMIT}


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def bank_account_query(doctype, txt, searchfield, start, page_len, filters):
	"""The Bank Account filter's search: the company's own bank accounts.

	Disabled ones are listed too, after the rest and marked so. An account closed
	since is still one whose transactions are worth reading back, and Frappe's own
	link search leaves anything disabled out -- which is why this query exists.

	Frappe validates the value picked through this same query, with the value as
	``txt``, so whatever is listed here is also what the filter accepts.

	Bank Account is read past its own permissions, which are the accounting roles'.
	The roles this page is for need not hold any of them, and the accounts listed
	are only the names their BRS Transactions are posted against -- so reading
	those transactions is what is asked for instead.
	"""
	frappe.has_permission(TRANSACTION_DOCTYPE, "read", throw=True)

	accounts = frappe.get_all(
		"Bank Account",
		filters={"is_company_account": 1, "name": ["like", f"%{txt}%"]},
		fields=["name", "disabled"],
		order_by="disabled asc, name asc",
		limit_start=start,
		limit=page_len,
	)
	# the second value is what the dropdown shows under the account's name
	return [(account.name, _("Disabled") if account.disabled else "") for account in accounts]
