"""Server side of the Leads page (page/leads).

The page lists the Enquiries, newest first, with the closed ones (a Status in
the Closed group) left out until its "Show Closed" box is ticked, and narrows
them by the boxes above the list:

- Q#, the Enquiry itself: a bare number is the Q-series one, 58 being Q58;
- Title, keeping the Enquiries whose Title holds what was typed anywhere in it;
- Mobile, keeping the Enquiries on that number -- once it is one, 10 digits:
  anything short of that narrows nothing;
- Date, Customer, List in, Lead By, Assigned To and Status, each keeping the
  Enquiries whose field is the one picked;
- Status Group, keeping the Enquiries whose Status is in the group picked.

A Status or Status Group picked is listed whatever the Show Closed box says:
picking Won, or Closed, is asking for those. The boxes filled in together keep
the Enquiries that match them all. A click on a row opens the Mobile Dashboard
on its Mobile (see mobile_dashboard.py).

The Enquiries are read through `frappe.get_list`, so a user sees only the ones
their own permissions allow.
"""

import re

import frappe

from logicx_biz.logicx_hr.member_dashboard import ENQUIRY_FIELDS, ORDER_BY, _closed_statuses, _enquiry_view
from logicx_biz.logicx_hr.mobile_dashboard import ROW_LIMIT, _tab

# the prefix of the series Enquiries are named in (Q.#, see enquiry.json), which
# a bare number in the Q# box is read with
ENQUIRY_PREFIX = "Q"

# exactly 10 digits, with no +91, spaces or dashes: the rule a Mobile Contact is
# saved by (see logicx_erp/mobile_validation.py), and so the only Mobile an
# Enquiry can have
MOBILE_NUMBER = re.compile(r"\d{10}")


@frappe.whitelist()
def get_leads(
	enquiry: str | None = None,
	date: str | None = None,
	title: str | None = None,
	mobile: str | None = None,
	customer: str | None = None,
	list_in: str | None = None,
	lead_by: str | None = None,
	assigned_to: str | None = None,
	status_group: str | None = None,
	status: str | None = None,
	show_closed: bool = False,
) -> dict:
	"""The Enquiries matching every one of these that is given, newest first.

	An empty one leaves the list unfiltered by it, as does a `mobile` that is not
	10 digits. The closed ones are left out unless `show_closed`, or `status` or
	`status_group` names the ones asked for. `rows` holds the Enquiries, and
	`more` says they were cut at ROW_LIMIT.
	"""
	filters = []

	enquiry = _clean(enquiry)
	if enquiry:
		filters.append(["name", "=", f"{ENQUIRY_PREFIX}{enquiry}" if enquiry.isdigit() else enquiry])

	title = _clean(title)
	if title:
		filters.append(["title", "like", f"%{title}%"])

	mobile = _clean(mobile)
	if MOBILE_NUMBER.fullmatch(mobile):
		filters.append(["mobile", "=", mobile])

	# the picked ones, matched exactly
	for fieldname, value in (
		("date", date),
		("customer", customer),
		("group", list_in),
		("user_employee", lead_by),
		("assigned_to_employee", assigned_to),
		("status", status),
	):
		value = _clean(value)
		if value:
			filters.append([fieldname, "=", value])

	status_group = _clean(status_group)
	if status_group:
		statuses = _group_statuses(status_group)
		# no Status in the group, no Enquiry either
		if not statuses:
			return _tab([])
		filters.append(["status", "in", statuses])
	elif not (_clean(status) or show_closed):
		closed = _closed_statuses()
		# no Status in the group, nothing to leave out
		if closed:
			filters.append(["status", "not in", closed])

	rows = frappe.get_list(
		"Enquiry",
		filters=filters,
		fields=list(ENQUIRY_FIELDS),
		order_by=ORDER_BY,
		limit=ROW_LIMIT + 1,
	)
	return _tab(_enquiry_view(rows))


def _group_statuses(group: str) -> list:
	"""The Enquiry Statuses in `group`, read as _closed_statuses reads the Closed
	ones: afresh, and with get_all."""
	return frappe.get_all("Enquiry Status", filters={"status_group": group}, pluck="name")


def _clean(value: str | None) -> str:
	return (value or "").strip()
