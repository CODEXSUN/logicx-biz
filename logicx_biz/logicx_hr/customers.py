"""Server side of the Customers page (page/customers).

The page lists the active Customers -- the ones not Disabled -- by name, A to Z,
and narrows them by the Mobile No and Name boxes above the list: each keeps the
Customers whose Mobile No, or Customer Name, holds what was typed anywhere in
it, and the two together the ones that match both. A click on a row opens the
Customer Dashboard on it (see customer_dashboard.py).

The Customers are read through `frappe.get_list`, so a user sees only the ones
their own permissions allow, and of those only the fields they may read (see
_readable_fields).
"""

import frappe
from frappe.model import get_permitted_fields

from logicx_biz.logicx_hr.mobile_dashboard import ROW_LIMIT, _tab, _titles

# by name, A to Z
ORDER_BY = "customer_name asc"

# what the list shows, but for its GSTIN (see GSTIN_FIELDS). a tuple, handed to
# get_list as a fresh list, for the reason mobile_dashboard.py gives.
CUSTOMER_FIELDS = ("name", "customer_name", "mobile_no", "email_id")

# where a Customer's GSTIN is kept, the first of these it has: India
# Compliance's GSTIN / UIN when that app is installed, ERPNext's own Tax ID when
# it is not. the row carries it as `gstin` either way.
GSTIN_FIELDS = ("gstin", "tax_id")


@frappe.whitelist()
def get_customers(mobile: str | None = None, customer_name: str | None = None) -> dict:
	"""The active Customers whose Mobile No holds `mobile` and whose Customer
	Name holds `customer_name`, by name.

	An empty one leaves the list unfiltered by it. `rows` holds the Customers,
	and `more` says they were cut at ROW_LIMIT.
	"""
	filters = {"disabled": 0}
	mobile = (mobile or "").strip()
	customer_name = (customer_name or "").strip()
	if mobile:
		filters["mobile_no"] = ("like", f"%{mobile}%")
	if customer_name:
		filters["customer_name"] = ("like", f"%{customer_name}%")

	gstin_field = _gstin_field()
	fields = _readable_fields((*CUSTOMER_FIELDS, gstin_field))
	rows = frappe.get_list(
		"Customer",
		filters=filters,
		fields=fields,
		order_by=ORDER_BY,
		limit=ROW_LIMIT + 1,
	)

	# a user who may only select Customers sees their names in every Link to
	# one, and so here too, read as those are
	names = (
		_titles("Customer", "customer_name", [row.name for row in rows])
		if "customer_name" not in fields
		else {}
	)
	for row in rows:
		row.gstin = row.pop(gstin_field, None) or ""
		if names:
			row.customer_name = names.get(row.name) or row.name
	return _tab(rows)


def _gstin_field() -> str | None:
	meta = frappe.get_meta("Customer")
	return next((fieldname for fieldname in GSTIN_FIELDS if meta.has_field(fieldname)), None)


def _readable_fields(fields: tuple) -> list:
	"""Those of `fields` the user may read on a Customer.

	Asked for one it may not, get_list throws rather than leaving it out, and a
	user who may only select Customers may read no more than its search fields --
	Mobile No among them, Customer Name, Email and GSTIN not -- so the rest are
	left out here, and the page shows them blank.
	"""
	permitted = set(get_permitted_fields("Customer"))
	return [fieldname for fieldname in fields if fieldname in permitted]
