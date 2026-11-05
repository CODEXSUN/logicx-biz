"""Server side of logicx-front's Enquiry pages: its Jobs and Leads lists (and
the CRM dashboard's counts of them), and the Enquiry page (/crm/enquiry/<Q#>).

`get_enquiry_list` lists the logged-in user's open Jobs or Leads, as
member_dashboard.get_tab does for My Dashboard, each Enquiry with its Status
Group and its Job Summary's counts besides.

`get_enquiry` reads one Enquiry, the activity posted on it, and who is checked
in on it, in one call:

- the Enquiry as get_enquiry_list lists it -- the Customer, Lead By and
  Assigned To by name, its Status Group and its Job Summary's counts, and its
  Mobile, which the page calls and WhatsApps -- with its Enquiry Details
  besides, as text;
- its Job Activity, newest first: the lines Job Comments, Job Execution, Job
  Estimate, Job Location and Job Attachment post on it (see
  doctype/job_activity), and any entered by hand;
- its Running Job Executions: the user's own, if any -- the page shows
  Check-In without one, and Check-Out with one -- and other Employees', which
  the page lists too, and warns of when more than one person is checked in.

The page posts its comments as Job Comments, over REST, and each is added to
the activity as it is saved (JobComments.on_update). It checks in and out with
Job Execution's start_execution and stop_execution, over REST too.

Enquiries are read in one query with their Enquiry Status and Job Summary
(_enquiries), which applies none of the user's permissions: get_enquiry_list
checks that they may read Enquiries at all, and get_enquiry that they may read
its Enquiry, so one they may not read is one that is not there. The activity
and the Job Executions go through `frappe.get_list`, so a user sees only what
their own permissions allow.
"""

import frappe
from frappe import _
from frappe.query_builder import Order
from frappe.query_builder.functions import IfNull
from frappe.utils import escape_html, get_fullname

from logicx_biz.logicx_hr.doctype.enquiry.enquiry import get_current_employee
from logicx_biz.logicx_hr.doctype.job_summary.job_summary import COUNT_FIELDS
from logicx_biz.logicx_hr.member_dashboard import (
	CLOSED_GROUP,
	ENQUIRY_FIELDS,
	TAB_FIELDS,
	_current_employee,
	_enquiry_view,
	_titles,
)
from logicx_biz.logicx_hr.mobile_dashboard import (
	ENQUIRY_JOB_TYPE,
	ORDER_BY,
	ROW_LIMIT,
	_multiline_text,
	_tab,
)

# what the page reads of the Enquiry: what Jobs and Leads list, Mobile included,
# and the Enquiry Details its card leaves out
ENQUIRY_VIEW_FIELDS = (*ENQUIRY_FIELDS, "enquiry_details")

# what the activity reads: when each line was posted and by whom, and what
# posted it -- Job Comments, Job Execution, ..., or nothing for one entered by
# hand
JOB_ACTIVITY_FIELDS = (
	"name",
	"creation",
	"owner",
	"job_activity_type",
	"activity_details",
)

# what the page reads of a Running Job Execution: its ID, which Check-Out
# stops, and when and where it started. a tuple, as above.
RUNNING_EXECUTION_FIELDS = ("name", "date", "start_time", "site")


@frappe.whitelist()
def get_enquiry_list(tab: str) -> dict:
	"""The logged-in user's Employee, and its open Enquiries on `tab`: "jobs",
	the ones assigned to it, or "leads", the ones it created.

	Answers as get_tab does for those tabs, without its `member` and
	`show_closed`: `employee` is None, and nothing else is read, when no
	Employee is linked to the user. Otherwise `rows` holds the Enquiries,
	newest first, without the closed ones (a Status in the Closed group), each
	as get_tab has it plus its Status Group and its Job Summary's counts (see
	_enquiries); and `more` says they were cut at ROW_LIMIT.

	The rows are read without the user's permissions on each Enquiry: one who
	may read Enquiries at all sees every one their Employee is on. PermissionError
	when they may not.
	"""
	if tab not in TAB_FIELDS:
		frappe.throw(_("Unknown tab: {0}").format(escape_html(tab)))

	employee = _current_employee()
	if not employee:
		return {"employee": None}
	frappe.has_permission("Enquiry", throw=True)

	rows = _enquiries(
		ENQUIRY_FIELDS,
		lambda enquiry, status: (enquiry[TAB_FIELDS[tab]] == employee.name)
		# an Enquiry with no Status, or one in no group, is open
		& (IfNull(status.status_group, "") != CLOSED_GROUP),
		ROW_LIMIT + 1,
	)
	return {
		"employee": employee.name,
		"employee_name": employee.employee_name or employee.name,
		**_tab(_enquiry_view(rows)),
	}


@frappe.whitelist()
def get_enquiry(name: str) -> dict:
	"""The Enquiry `name`, the activity posted on it, and its Running Job
	Executions.

	`enquiry` is the Enquiry as get_enquiry_list's rows have it -- its Customer
	and both Employees by name, its Status Group and its Job Summary's counts
	-- with its Enquiry Details as `details`: plain text, a line per line
	written. `activity` holds its Job Activity, newest first: `rows`, each with
	its details as `text` and who posted it by name as `owner_name`, and
	`more`, which says they were cut at ROW_LIMIT. `execution` is the user's
	own Running Job Execution on it, or None, and `others` holds other
	Employees' -- `rows`, newest first, and `more` -- each with its Employee's
	name as `employee_name` (see _running_executions). `employee` is the user's
	Employee ID, or None when no Employee is linked to the user: the page shows
	"by me" or "to me" where it is the Enquiry's `user_employee` or
	`assigned_to_employee`, as Jobs and Leads do with get_enquiry_list's
	`employee`.

	DoesNotExistError when there is no such Enquiry, or the user may not read it.
	"""
	rows = _enquiries(ENQUIRY_VIEW_FIELDS, lambda enquiry, status: enquiry.name == name, 1)
	# _enquiries applies no permissions, so the user's on this Enquiry are
	# checked here, as get_list would have
	if not rows or not frappe.has_permission("Enquiry", doc=rows[0].name):
		frappe.throw(_("Enquiry {0} not found").format(escape_html(name)), frappe.DoesNotExistError)

	enquiry = _enquiry_view(rows)[0]
	enquiry.details = _multiline_text(enquiry.pop("enquiry_details", None))
	employee = get_current_employee()
	execution, others = _running_executions(ENQUIRY_JOB_TYPE, enquiry.name, employee)
	return {
		"employee": employee.name if employee else None,
		"enquiry": enquiry,
		"activity": _tab(_activity(ENQUIRY_JOB_TYPE, enquiry.name)),
		"execution": execution,
		"others": _tab(others),
	}


def _enquiries(fields: tuple, where, limit: int) -> list:
	"""Up to `limit` of the Enquiries `where(enquiry, status)` picks, newest
	first: their `fields`, their Enquiry Status's `status_group`, and their Job
	Summary's counts (job_summary.COUNT_FIELDS), each 0 for an Enquiry with no
	Job Summary.

	One query, Enquiry LEFT JOIN Enquiry Status LEFT JOIN Job Summary, through
	frappe.qb, so with none of the user's permissions: callers check them.
	"""
	enquiry = frappe.qb.DocType("Enquiry")
	status = frappe.qb.DocType("Enquiry Status")
	summary = frappe.qb.DocType("Job Summary")
	return (
		frappe.qb.from_(enquiry)
		.left_join(status)
		.on(status.name == enquiry.status)
		# at most one: Job Type + Job ID is unique
		.left_join(summary)
		.on((summary.job_type == ENQUIRY_JOB_TYPE) & (summary.job_id == enquiry.name))
		.select(
			*(enquiry[field] for field in fields),
			status.status_group,
			*(IfNull(summary[field], 0).as_(field) for field in COUNT_FIELDS),
		)
		.where(where(enquiry, status))
		.orderby(enquiry.creation, order=Order.desc)
		.limit(limit)
		.run(as_dict=True)
	)


def _activity(job_type: str, job_id: str) -> list:
	"""Up to ROW_LIMIT + 1 of the Job Activity rows posted on the job, newest
	first, each with its details as text, a line per line written, and who
	posted it by name.
	"""
	rows = frappe.get_list(
		"Job Activity",
		filters={"job_type": job_type, "job_id": job_id},
		fields=list(JOB_ACTIVITY_FIELDS),
		order_by=ORDER_BY,
		limit=ROW_LIMIT + 1,
	)
	for row in rows:
		row.text = _multiline_text(row.pop("activity_details", None))
		row.owner_name = get_fullname(row.owner)
	return rows


def _running_executions(job_type: str, job_id: str, employee) -> tuple[dict | None, list]:
	"""Who is checked in on the job: its Running Job Executions, each with its
	Employee's name as `employee_name`.

	`employee` is the logged-in user's Employee (get_current_employee), or None.
	Their own -- the one start_execution refuses a second of; the newest,
	should the desk have made more than one -- or None; and up to ROW_LIMIT + 1
	of other Employees', newest first, with their `employee`. With no
	Employee linked to the user (`employee` None), every one is another's. (None, [])
	when the user may not read Job Executions: the page is still shown, and
	Check-In gets Frappe's answer.
	"""
	if not frappe.has_permission("Job Execution"):
		return None, []

	running = {"job_type": job_type, "job_id": job_id, "status": "Running"}

	execution = None
	if employee:
		rows = frappe.get_list(
			"Job Execution",
			filters={**running, "employee": employee.name},
			fields=list(RUNNING_EXECUTION_FIELDS),
			order_by=ORDER_BY,
			limit=1,
		)
		if rows:
			execution = rows[0]
			execution.employee_name = employee.employee_name or employee.name

	others = frappe.get_list(
		"Job Execution",
		filters={**running, "employee": ("!=", employee.name)} if employee else running,
		fields=[*RUNNING_EXECUTION_FIELDS, "employee"],
		order_by=ORDER_BY,
		limit=ROW_LIMIT + 1,
	)
	names = _titles("Employee", "employee_name", [row.employee for row in others])
	for row in others:
		row.employee_name = names.get(row.employee) or row.employee
	return execution, others
