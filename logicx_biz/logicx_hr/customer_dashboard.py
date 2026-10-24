"""Server side of the Customer Dashboard page (page/customer_dashboard).

The page asks about one Customer at a time, as the Mobile Dashboard asks about
one number. `get_dashboard` says whether the Customer is there for the user to
see and, when it is, returns its name and Mobile No -- for the page's WhatsApp
button and its "New Enquiry for {Customer Name}" -- and what each of the page's
tabs lists: the Enquiries whose Customer it is, and the Job Activity, Job
Comments, Job Execution and Job Estimate rows filed on the Customer itself or
posted against those Enquiries -- every tab newest first. The Enquiries' Mobile
plays no part in what is listed.

A job row names its job through `job_type` / `job_id` (see
doctype/job_type/DESIGN.md), so the four job tabs are read off the Customer's
own name and the names of the Enquiries the first tab lists. Every read goes
through `frappe.get_list`, so a user sees only what their own permissions allow,
and the job tabs cover exactly the Enquiries that user can see. What the two
pages read alike is read by the Mobile Dashboard's own helpers.
"""

import frappe
from frappe import _

from logicx_biz.logicx_hr.mobile_dashboard import (
	ENQUIRY_JOB_TYPE,
	JOB_ACTIVITY_FIELDS,
	JOB_COMMENT_FIELDS,
	JOB_ESTIMATE_FIELDS,
	JOB_EXECUTION_FIELDS,
	ORDER_BY,
	ROW_LIMIT,
	_activity_view,
	_comment_view,
	_tab,
	_titles,
	_with_titles,
)

# the Job Type of a job row filed on a Customer itself, whose Job ID is then the
# Customer's name -- which is how the page's comment box files its comments
CUSTOMER_JOB_TYPE = "Customer"

# what the Enquiries tab reads: the Mobile in place of the Customer, which is the
# same on every row, and the assignee, who gains a name alongside (see
# _enquiry_view). a tuple, handed to get_list as a fresh list, for the reason
# mobile_dashboard.py gives.
ENQUIRY_FIELDS = (
	"name",
	"date",
	"title",
	"mobile",
	"group",
	"assigned_to_employee",
	"status",
)


@frappe.whitelist()
def get_dashboard(customer: str) -> dict:
	"""Everything the Customer Dashboard shows for `customer`.

	`found` is False, and nothing else is read, when there is no such Customer, or
	none the user may see. Otherwise `customer_name` and `mobile` (its Mobile No,
	"" when it has none) say who it is, and `tabs` holds one `{rows, more}` per
	tab, keyed as the page's TABS are; `more` says the tab was cut at ROW_LIMIT
	rows.
	"""
	customer = (customer or "").strip()
	if not customer:
		frappe.throw(_("Customer is mandatory"))

	# through get_list like every other read here, so the Customer is found only
	# when the user may see it. mobile_no is one of Customer's search fields, so
	# it comes back even to a user who may only select Customers.
	match = frappe.get_list("Customer", filters={"name": customer}, fields=["name", "mobile_no"], limit=1)
	if not match:
		return {"customer": customer, "found": False}

	# all of the Customer's Enquiries, not only the ones the first tab has room
	# for: the job tabs are filtered by every one of them
	enquiries = frappe.get_list(
		"Enquiry",
		filters={"customer": customer},
		fields=list(ENQUIRY_FIELDS),
		order_by=ORDER_BY,
		limit_page_length=0,
	)
	enquiry_names = [row.name for row in enquiries]

	return {
		"customer": customer,
		"found": True,
		# the name a Link to it shows, read as every such name on the page is
		"customer_name": _titles("Customer", "customer_name", [customer]).get(customer) or customer,
		"mobile": (match[0].get("mobile_no") or "").strip(),
		"tabs": {
			"enquiries": _tab(_enquiry_view(enquiries[: ROW_LIMIT + 1])),
			"job_activity": _tab(
				_activity_view(_job_rows("Job Activity", JOB_ACTIVITY_FIELDS, customer, enquiry_names))
			),
			"comments": _tab(
				_comment_view(_job_rows("Job Comments", JOB_COMMENT_FIELDS, customer, enquiry_names))
			),
			"job_execution": _tab(
				_with_titles(
					_job_rows("Job Execution", JOB_EXECUTION_FIELDS, customer, enquiry_names),
					"employee",
					"Employee",
					"employee_name",
				)
			),
			"job_estimate": _tab(
				_with_titles(
					_job_rows("Job Estimate", JOB_ESTIMATE_FIELDS, customer, enquiry_names),
					"supplier",
					"Supplier",
					"supplier_name",
				)
			),
		},
	}


def _job_rows(doctype: str, fields: tuple, customer: str, enquiry_names: list) -> list:
	"""The `doctype` rows filed on the Customer itself or on one of its Enquiries, newest first.

	Two reads, as one set of filters cannot pair each Job Type with its own Job IDs;
	no row carries both, so none comes back twice. Each stops one row past
	ROW_LIMIT, so the newest ROW_LIMIT + 1 of the two together are all among what
	comes back, for _tab to tell the page there are more. No Enquiries means no
	second read: an empty IN would match nothing anyway.

	`enquiry` names a row's Enquiry, and is empty on one filed on the Customer.
	"""
	# creation, to put the two reads in one order by; job_id, for `enquiry`
	fields = tuple(dict.fromkeys(fields + ("creation", "job_id")))
	reads = [(CUSTOMER_JOB_TYPE, customer)]
	if enquiry_names:
		reads.append((ENQUIRY_JOB_TYPE, ("in", enquiry_names)))

	rows = []
	for job_type, job_id in reads:
		for row in frappe.get_list(
			doctype,
			filters={"job_type": job_type, "job_id": job_id},
			fields=list(fields),
			order_by=ORDER_BY,
			limit=ROW_LIMIT + 1,
		):
			row.enquiry = row.job_id if job_type == ENQUIRY_JOB_TYPE else ""
			rows.append(row)

	rows.sort(key=lambda row: row.creation, reverse=True)
	return rows[: ROW_LIMIT + 1]


def _enquiry_view(rows: list) -> list:
	"""Enquiry rows with the assignee by name."""
	employees = _titles("Employee", "employee_name", [row.assigned_to_employee for row in rows])
	for row in rows:
		row.assigned_to_name = employees.get(row.assigned_to_employee) or row.assigned_to_employee
	return rows
