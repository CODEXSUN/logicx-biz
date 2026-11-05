"""Server side of logicx-front's Duty pages: its Duties list, and the Duty
Reporting page (/crm/duty/<Duty ID>).

A Duty is an SOP assigned to an Employee. A Duty Reporting is what that Employee
reports on it for one date, and the job -- Job Type "Duty Reporting", Job ID its
name -- that their comments, check-ins and activity are posted on.

`get_duty_list` lists the logged-in user's Duties, by Index, each with the date
today and the Job Summary's counts of its Duty Reporting dated today.

`get_duty_reporting` opens one of those Duties for today: it finds the Duty
Reporting of that SOP, Employee and date, makes it if there is none, and answers
as enquiry_view.get_enquiry does, with the Duty Reporting in place of the Enquiry.
It may write, so it answers only to a POST: Frappe rolls back what a GET does.

The page posts its comments as Job Comments, and checks in and out with Job
Execution's methods, over REST, as the Enquiry page does.

Duties go through `frappe.get_list`, so with the user's permissions. Duty
Reportings are read in one query with their Job Summary (_reportings), which
applies none: the user's own Duties are what they are read for, and
get_duty_reporting checks the user may read the one it answers with. The activity
and the Job Executions go through `frappe.get_list`, as for an Enquiry.
"""

import frappe
from frappe import _
from frappe.query_builder.functions import IfNull
from frappe.utils import escape_html, nowdate

from logicx_biz.logicx_hr.doctype.job_summary.job_summary import COUNT_FIELDS
from logicx_biz.logicx_hr.enquiry_view import _activity, _running_executions
from logicx_biz.logicx_hr.member_dashboard import DUTY_ORDER_BY, _current_employee
from logicx_biz.logicx_hr.mobile_dashboard import ROW_LIMIT, _multiline_text, _tab

# the Job Type of what is posted on a Duty Reporting
DUTY_REPORTING_JOB_TYPE = "Duty Reporting"

# oldest first: when there are several of one SOP, Employee and date, as the desk
# can make, the oldest is the one used, so one made later doesn't change it
OLDEST_FIRST = "creation asc"

# what the list reads of a Duty. a tuple, and handed to get_list as a fresh list:
# get_list may rework the list it is given in place, which on a shared one would
# carry into the next request.
DUTY_LIST_FIELDS = ("name", "sop", "sop_name")

# what the page reads of a Duty Reporting
REPORTING_FIELDS = ("name", "date", "sop_name", "steps")

# what a new Duty Reporting's Actions says. The field is still reqd, and no longer
# used: what is done on a Duty is posted as Job Comments
# (patches/copy_duty_reporting_actions_to_job_comments.py).
ACTIONS = "see comments."


@frappe.whitelist()
def get_duty_list() -> dict:
	"""The logged-in user's Employee, and its Duties.

	Answers as enquiry_view.get_enquiry_list does: `employee` is None, and nothing
	else is read, when no Employee is linked to the user. Otherwise `rows` holds the
	Duties, by Index, each with `date`, today as Frappe has it, and the counts
	(job_summary.COUNT_FIELDS) of its Duty Reporting dated today, 0 without one; and
	`more` says they were cut at ROW_LIMIT. PermissionError when the user may not
	read Duties.
	"""
	employee = _current_employee()
	if not employee:
		return {"employee": None}

	duties = frappe.get_list(
		"Duty",
		filters={"employee": employee.name},
		fields=list(DUTY_LIST_FIELDS),
		order_by=DUTY_ORDER_BY,
		limit=ROW_LIMIT + 1,
	)
	today = nowdate()
	reportings = _reportings_by_sop(employee.name, today, [duty.sop for duty in duties])
	for duty in duties:
		duty.date = today
		reporting = reportings.get(duty.sop)
		for field in COUNT_FIELDS:
			duty[field] = reporting[field] if reporting else 0
	return {
		"employee": employee.name,
		"employee_name": employee.employee_name or employee.name,
		**_tab(duties),
	}


@frappe.whitelist(methods=["POST"])
def get_duty_reporting(name: str) -> dict:
	"""The Duty Reporting of the Duty `name` dated today, made now when there is none,
	the activity posted on it, and its Running Job Executions.

	`reporting` is the Duty Reporting -- its `name`, `date` and `sop_name`, its Duty's
	ID as `duty`, its Steps as `steps`, plain text, a line per line written, and its
	Job Summary's counts, each 0 without one. `activity`, `execution` and `others` are
	as get_enquiry has them.

	DoesNotExistError when there is no such Duty, it isn't the logged-in user's own
	Employee's, or the user may not read it: opening it could make a Duty Reporting,
	which nobody should do for another Employee. PermissionError when they may not
	make or read the Duty Reporting.
	"""
	employee = _current_employee()
	duty = frappe.db.get_value("Duty", name, ["name", "sop", "employee"], as_dict=True)
	if (
		not employee
		or not duty
		or duty.employee != employee.name
		or not frappe.has_permission("Duty", doc=duty.name)
	):
		frappe.throw(_("Duty {0} not found").format(escape_html(name)), frappe.DoesNotExistError)

	reporting_name = _today_reporting(duty)
	# _reportings applies no permissions
	frappe.has_permission("Duty Reporting", doc=reporting_name, throw=True)

	reporting = _reportings(REPORTING_FIELDS, lambda row: row.name == reporting_name)[0]
	reporting.duty = duty.name
	reporting.steps = _multiline_text(reporting.steps)
	execution, others = _running_executions(DUTY_REPORTING_JOB_TYPE, reporting.name, employee)
	return {
		"reporting": reporting,
		"activity": _tab(_activity(DUTY_REPORTING_JOB_TYPE, reporting.name)),
		"execution": execution,
		"others": _tab(others),
	}


def _today_reporting(duty) -> str:
	"""The name of the Duty Reporting of `duty`'s SOP and Employee dated today, made
	now when there is none.
	"""
	filters = {"sop": duty.sop, "employee": duty.employee, "date": nowdate()}
	name = frappe.db.get_value("Duty Reporting", filters, "name", order_by=OLDEST_FIRST)
	if name:
		return name

	# Nothing makes these unique, so two requests at once, from two devices say, would
	# each find none and make one. The second waits here until the first has committed.
	frappe.db.get_value("Duty", duty.name, "name", for_update=True)
	# A locking read: a plain one would still see the database as this transaction
	# first did, without the row the first request made.
	name = frappe.db.get_value("Duty Reporting", filters, "name", order_by=OLDEST_FIRST, for_update=True)
	if name:
		# So that the reads to come see that row too.
		frappe.db.commit()
		return name

	return frappe.get_doc({"doctype": "Duty Reporting", **filters, "actions": ACTIONS}).insert().name


def _reportings_by_sop(employee: str, date: str, sops: list) -> dict:
	"""SOP -> the oldest of `employee`'s Duty Reportings on it dated `date`, by name
	and with its counts (see _reportings).
	"""
	if not sops:
		return {}

	rows = _reportings(
		("name", "sop"),
		lambda row: (row.employee == employee) & (row.date == date) & row.sop.isin(sops),
	)
	oldest = {}
	for row in rows:
		oldest.setdefault(row.sop, row)
	return oldest


def _reportings(fields: tuple, where) -> list:
	"""The Duty Reportings `where(reporting)` picks, oldest first: their `fields`, and
	their Job Summary's counts (job_summary.COUNT_FIELDS), each 0 for one with no Job
	Summary.

	One query, Duty Reporting LEFT JOIN Job Summary, through frappe.qb, so with none
	of the user's permissions: callers check them.
	"""
	reporting = frappe.qb.DocType("Duty Reporting")
	summary = frappe.qb.DocType("Job Summary")
	return (
		frappe.qb.from_(reporting)
		# at most one: Job Type + Job ID is unique
		.left_join(summary)
		.on((summary.job_type == DUTY_REPORTING_JOB_TYPE) & (summary.job_id == reporting.name))
		.select(
			*(reporting[field] for field in fields),
			*(IfNull(summary[field], 0).as_(field) for field in COUNT_FIELDS),
		)
		.where(where(reporting))
		.orderby(reporting.creation)
		.run(as_dict=True)
	)
