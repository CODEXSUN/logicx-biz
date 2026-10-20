"""Server side of the Mobile Dashboard page (page/mobile_dashboard).

The page asks about one mobile number at a time. `get_dashboard` says whether it
is a Mobile Contact and, when it is, returns what each of the page's tabs lists:
the contact's Enquiries, and the Job Activity, Job Execution and Job Estimate
rows posted against them -- every tab newest first.

A job row names its Enquiry through `job_type` / `job_id` (see
doctype/job_type/DESIGN.md), so the three job tabs are read off the names of the
Enquiries the first tab lists. Every read goes through `frappe.get_list`, so a
user sees only what their own permissions allow, and the job tabs cover exactly
the Enquiries that user can see.
"""

import html
import re

import frappe
from frappe import _
from frappe.utils import get_fullname

from logicx_biz.logicx_erp.mobile_validation import validate_mobile_number

# the Job Type every job row of an Enquiry carries
ENQUIRY_JOB_TYPE = "Enquiry"

# newest first, on every tab
ORDER_BY = "creation desc"

# the most rows a tab lists. one more is read, so the page can tell a tab cut
# short here from one that happens to hold exactly this many.
ROW_LIMIT = 500

# what each tab reads. a Text Editor field goes out as plain `details` (see
# _plain_text), and a Link to a person or party gains its name alongside.
# tuples, and handed to get_list as fresh lists: get_list may rework the list
# it is given in place, which on a shared one would carry into the next request.
ENQUIRY_FIELDS = (
	"name",
	"date",
	"title",
	"customer",
	"group",
	"assigned_to_employee",
	"status",
)
JOB_ACTIVITY_FIELDS = (
	"name",
	"creation",
	"job_id",
	"job_activity_type",
	# no column of its own, but the record a click on the row opens
	"job_activity_id",
	"activity_details",
	"owner",
)
JOB_EXECUTION_FIELDS = (
	"name",
	"job_id",
	"date",
	"employee",
	"start_time",
	"stop_time",
	"hours",
	"total_cost",
	"status",
)
JOB_ESTIMATE_FIELDS = ("name", "job_id", "date", "item_name", "supplier", "price")

HTML_TAG = re.compile(r"<[^>]*>")


@frappe.whitelist()
def get_dashboard(mobile: str) -> dict:
	"""Everything the Mobile Dashboard shows for `mobile`.

	`found` is False, and nothing else is read, when the number is not a Mobile
	Contact. Otherwise `tabs` holds one `{rows, more}` per tab, keyed as the
	page's TABS are; `more` says the tab was cut at ROW_LIMIT rows.
	"""
	mobile = (mobile or "").strip()
	if not mobile:
		frappe.throw(_("Mobile Number is mandatory"))
	# the same 10-digit check a Mobile Contact is saved with
	validate_mobile_number(mobile, _("Mobile Number"))

	if not frappe.get_list("Mobile Contact", filters={"name": mobile}, pluck="name", limit=1):
		return {"mobile": mobile, "found": False}

	# all of the contact's Enquiries, not only the ones the first tab has room
	# for: the job tabs are filtered by every one of them
	enquiries = frappe.get_list(
		"Enquiry",
		filters={"mobile": mobile},
		fields=list(ENQUIRY_FIELDS),
		order_by=ORDER_BY,
		limit_page_length=0,
	)
	enquiry_names = [row.name for row in enquiries]

	return {
		"mobile": mobile,
		"found": True,
		"tabs": {
			"enquiries": _tab(_enquiry_view(enquiries[: ROW_LIMIT + 1])),
			"job_activity": _tab(
				_activity_view(_job_rows("Job Activity", JOB_ACTIVITY_FIELDS, enquiry_names))
			),
			"job_execution": _tab(
				_with_titles(
					_job_rows("Job Execution", JOB_EXECUTION_FIELDS, enquiry_names),
					"employee",
					"Employee",
					"employee_name",
				)
			),
			"job_estimate": _tab(
				_with_titles(
					_job_rows("Job Estimate", JOB_ESTIMATE_FIELDS, enquiry_names),
					"supplier",
					"Supplier",
					"supplier_name",
				)
			),
		},
	}


def _job_rows(doctype: str, fields: tuple, enquiry_names: list) -> list:
	"""The `doctype` rows posted against these Enquiries, newest first.

	Reads one row past ROW_LIMIT, for _tab to tell the page there are more. No
	Enquiries means no rows, and no query: an empty IN would match nothing anyway.
	"""
	if not enquiry_names:
		return []
	return frappe.get_list(
		doctype,
		filters={"job_type": ENQUIRY_JOB_TYPE, "job_id": ("in", enquiry_names)},
		fields=list(fields),
		order_by=ORDER_BY,
		limit=ROW_LIMIT + 1,
	)


def _tab(rows: list) -> dict:
	return {"rows": rows[:ROW_LIMIT], "more": len(rows) > ROW_LIMIT}


def _enquiry_view(rows: list) -> list:
	"""Enquiry rows with the Customer and assignee by name."""
	customers = _titles("Customer", "customer_name", [row.customer for row in rows])
	employees = _titles("Employee", "employee_name", [row.assigned_to_employee for row in rows])
	for row in rows:
		row.customer_name = customers.get(row.customer) or row.customer
		row.assigned_to_name = employees.get(row.assigned_to_employee) or row.assigned_to_employee
	return rows


def _activity_view(rows: list) -> list:
	"""Job Activity rows with their details as text, and who posted each by name."""
	for row in rows:
		row.details = _plain_text(row.pop("activity_details", None))
		row.owner_name = get_fullname(row.owner)
	return rows


def _with_titles(rows: list, link_field: str, doctype: str, title_field: str) -> list:
	"""Rows with the `doctype` each links to through `link_field` named, as `title_field`.

	A link whose record has no name to give, or has gone, keeps its ID.
	"""
	titles = _titles(doctype, title_field, [row.get(link_field) for row in rows])
	for row in rows:
		row[title_field] = titles.get(row.get(link_field)) or row.get(link_field)
	return rows


def _titles(doctype: str, title_field: str, names: list) -> dict:
	"""name -> `title_field` for these names of `doctype`, in one read.

	get_all, as a Link field's title is shown whatever the reader's permission
	on the record it points at: the row linking to it is what is being read.
	"""
	names = list({name for name in names if name})
	if not names:
		return {}
	return dict(
		frappe.get_all(doctype, filters={"name": ("in", names)}, fields=["name", title_field], as_list=True)
	)


def _plain_text(value: str | None) -> str:
	"""A Text Editor value as one line of plain text, for a table cell.

	Stripped here rather than in the browser, where parsing the HTML to read its
	text would also run whatever handlers it carries. Tags become spaces, so two
	paragraphs do not run into one word.
	"""
	text = html.unescape(HTML_TAG.sub(" ", value or ""))
	return " ".join(text.split())
