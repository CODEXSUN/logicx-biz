"""Server side of logicx-front's Enquiry page (/crm/enquiry/<Q#>): one Enquiry,
the activity posted on it, and whether the user is checked in on it.

`get_enquiry` reads all three in one call:

- the Enquiry as Jobs and Leads list it (see member_dashboard.py) -- the
  Customer, Lead By and Assigned To by name, and its Mobile, which the page
  calls and WhatsApps -- with its Enquiry Details besides, as text;
- its Job Activity, newest first: the lines Job Comments, Job Execution, Job
  Estimate, Job Location and Job Attachment post on it (see
  doctype/job_activity), and any entered by hand;
- the user's own Running Job Execution on it, if any: the page shows Check-In
  without one, and Check-Out with one.

The page posts its comments as Job Comments, over REST, and each is added to
the activity as it is saved (JobComments.on_update). It checks in and out with
Job Execution's start_execution and stop_execution, over REST too. The reads go
through `frappe.get_list`, so a user sees only what their own permissions
allow, and an Enquiry they may not read is one that is not there.
"""

import frappe
from frappe import _
from frappe.utils import escape_html, get_fullname

from logicx_biz.logicx_hr.doctype.enquiry.enquiry import get_current_employee
from logicx_biz.logicx_hr.member_dashboard import ENQUIRY_FIELDS, _enquiry_view
from logicx_biz.logicx_hr.mobile_dashboard import (
	ENQUIRY_JOB_TYPE,
	ORDER_BY,
	ROW_LIMIT,
	_multiline_text,
	_tab,
)

# what the page reads of the Enquiry: what Jobs and Leads list, Mobile included,
# and the Enquiry Details its card leaves out. a tuple, handed to get_list as a
# fresh list, as ENQUIRY_FIELDS is.
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

# what the page reads of the user's Running Job Execution: its ID, which
# Check-Out stops, and when and where it started. a tuple, as above.
RUNNING_EXECUTION_FIELDS = ("name", "date", "start_time", "site")


@frappe.whitelist()
def get_enquiry(name: str) -> dict:
	"""The Enquiry `name`, the activity posted on it, and the user's Running
	Job Execution on it.

	`enquiry` is the Enquiry with its Customer and both Employees by name, as
	get_tab's rows have them, and its Enquiry Details as `details`: plain text,
	a line per line written. `activity` holds its Job Activity, newest first:
	`rows`, each with its details as `text` and who posted it by name as
	`owner_name`, and `more`, which says they were cut at ROW_LIMIT.
	`execution` is the user's own Running Job Execution on it, with their
	Employee's name as `employee_name`, or None (see _running_execution).

	DoesNotExistError when there is no such Enquiry, or the user may not read it.
	"""
	rows = frappe.get_list("Enquiry", filters={"name": name}, fields=list(ENQUIRY_VIEW_FIELDS), limit=1)
	if not rows:
		frappe.throw(_("Enquiry {0} not found").format(escape_html(name)), frappe.DoesNotExistError)

	enquiry = _enquiry_view(rows)[0]
	enquiry.details = _multiline_text(enquiry.pop("enquiry_details", None))
	return {
		"enquiry": enquiry,
		"activity": _tab(_activity(enquiry.name)),
		"execution": _running_execution(enquiry.name),
	}


def _activity(enquiry: str) -> list:
	"""Up to ROW_LIMIT + 1 of the Job Activity rows posted on `enquiry`, newest
	first, each with its details as text, a line per line written, and who
	posted it by name.
	"""
	rows = frappe.get_list(
		"Job Activity",
		filters={"job_type": ENQUIRY_JOB_TYPE, "job_id": enquiry},
		fields=list(JOB_ACTIVITY_FIELDS),
		order_by=ORDER_BY,
		limit=ROW_LIMIT + 1,
	)
	for row in rows:
		row.text = _multiline_text(row.pop("activity_details", None))
		row.owner_name = get_fullname(row.owner)
	return rows


def _running_execution(enquiry: str) -> dict | None:
	"""The logged-in user's own Running Job Execution on `enquiry` -- the one
	start_execution refuses a second of -- with their Employee's name as
	`employee_name`. The newest, should the desk have made more than one.

	None when there is none, when no Employee is linked to the user, or when
	they may not read Job Executions: the page is still shown, and Check-In
	gets Frappe's answer.
	"""
	employee = get_current_employee()
	if not employee or not frappe.has_permission("Job Execution"):
		return None

	rows = frappe.get_list(
		"Job Execution",
		filters={
			"job_type": ENQUIRY_JOB_TYPE,
			"job_id": enquiry,
			"employee": employee.name,
			"status": "Running",
		},
		fields=list(RUNNING_EXECUTION_FIELDS),
		order_by=ORDER_BY,
		limit=1,
	)
	if not rows:
		return None

	execution = rows[0]
	execution.employee_name = employee.employee_name or employee.name
	return execution
