"""Server side of logicx-front's Duty pages: its Duties list, and the Duty
Reporting page (/crm/duty/<Duty ID>).

A Duty is an SOP assigned to an Employee. A Duty Reporting is what that Employee
reports on it for one calendar period of the SOP's Frequency (_period), and the
job -- Job Type "Duty Reporting", Job ID its name -- that their comments, check-ins
and activity are posted on.

`get_duty_list` lists the logged-in user's Duties, by Index, each with its Frequency,
the first day of its current period, and the Job Summary's counts of its Duty
Reporting in that period.

`get_duty_reporting` opens one of those Duties for its current period: it finds the
Duty Reporting of that SOP and Employee dated in the period, makes it if there is
none, dated the period's first day, and answers as enquiry_view.get_enquiry does,
with the Duty Reporting in place of the Enquiry. It may write, so it answers only
to a POST: Frappe rolls back what a GET does.

The page posts its comments as Job Comments, and checks in and out with Job
Execution's methods, over REST, as the Enquiry page does.

Duties go through `frappe.get_list`, so with the user's permissions. Duty
Reportings are read in one query with their Job Summary (_reportings), which
applies none: the user's own Duties are what they are read for, and
get_duty_reporting checks the user may read the one it answers with. The activity
and the Job Executions go through `frappe.get_list`, as for an Enquiry.
"""

from functools import reduce
from operator import or_

import frappe
from frappe import _
from frappe.query_builder.functions import IfNull
from frappe.utils import (
	escape_html,
	get_first_day,
	get_first_day_of_week,
	get_last_day,
	get_last_day_of_week,
	get_year_ending,
	get_year_start,
	getdate,
	nowdate,
)

from logicx_biz.logicx_hr.doctype.job_summary.job_summary import COUNT_FIELDS
from logicx_biz.logicx_hr.enquiry_view import _activity, _running_executions
from logicx_biz.logicx_hr.member_dashboard import DUTY_ORDER_BY, _current_employee
from logicx_biz.logicx_hr.mobile_dashboard import ROW_LIMIT, _multiline_text, _tab

# the Job Type of what is posted on a Duty Reporting
DUTY_REPORTING_JOB_TYPE = "Duty Reporting"

# oldest first: when there are several of one SOP and Employee in a period, as the
# desk can make, the oldest is the one used, so one made later doesn't change it
OLDEST_FIRST = "creation asc"

# a Frequency's calendar period: what finds its first and last day from a date. Any
# other Frequency, as a site could add to SOP's, is one day (_period).
PERIODS = {
	"Weekly": (get_first_day_of_week, get_last_day_of_week),
	"Monthly": (get_first_day, get_last_day),
	"Yearly": (get_year_start, get_year_ending),
}

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
	Duties, by Index, each with `frequency`, its SOP's, `date`, the first day of its
	current period (_period), and the counts (job_summary.COUNT_FIELDS) of its Duty
	Reporting in that period, 0 without one; and `more` says they were cut at
	ROW_LIMIT. PermissionError when the user may not read Duties.
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
	frequencies = _frequencies([duty.sop for duty in duties])
	periods = {duty.sop: _period(frequencies.get(duty.sop)) for duty in duties}
	reportings = _reportings_by_sop(employee.name, periods)
	for duty in duties:
		duty.frequency = frequencies.get(duty.sop)
		duty.date = periods[duty.sop][0]
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
	"""The Duty Reporting of the Duty `name` in its current period, made now when there
	is none, the activity posted on it, and its Running Job Executions.

	`reporting` is the Duty Reporting -- its `name` and `sop_name`, its SOP's Frequency
	as `frequency`, the period's first day as `date`, whatever date it has itself, its
	Duty's ID as `duty`, its Steps as `steps`, plain text, a line per line written, and
	its Job Summary's counts, each 0 without one. `activity`, `execution` and `others`
	are as get_enquiry has them.

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

	frequency = frappe.db.get_value("SOP", duty.sop, "frequency")
	first, last = _period(frequency)
	reporting_name = _period_reporting(duty, first, last)
	# _reportings applies no permissions
	frappe.has_permission("Duty Reporting", doc=reporting_name, throw=True)

	reporting = _reportings(REPORTING_FIELDS, lambda row: row.name == reporting_name)[0]
	reporting.duty = duty.name
	reporting.frequency = frequency
	reporting.date = first
	reporting.steps = _multiline_text(reporting.steps)
	execution, others = _running_executions(DUTY_REPORTING_JOB_TYPE, reporting.name, employee)
	return {
		"reporting": reporting,
		"activity": _tab(_activity(DUTY_REPORTING_JOB_TYPE, reporting.name)),
		"execution": execution,
		"others": _tab(others),
	}


def _frequencies(sops: list) -> dict:
	"""SOP -> its Frequency. The SOP's own, as a Duty's copy changes only when that Duty
	is saved.
	"""
	if not sops:
		return {}

	rows = frappe.get_all("SOP", filters={"name": ["in", sops]}, fields=["name", "frequency"])
	return {row.name: row.frequency for row in rows}


def _period(frequency: str | None) -> tuple[str, str]:
	"""The first and last day, "YYYY-MM-DD", of the calendar period of `frequency` that
	today is in: its week, from System Settings' First Day of the Week, its month or
	its year. Daily, or any other Frequency, is today alone.
	"""
	today = getdate(nowdate())
	first, last = PERIODS.get(frequency, (getdate, getdate))
	return str(getdate(first(today))), str(getdate(last(today)))


def _period_reporting(duty, first: str, last: str) -> str:
	"""The name of the Duty Reporting of `duty`'s SOP and Employee dated from `first` to
	`last`, made now, dated `first`, when there is none.
	"""
	filters = {"sop": duty.sop, "employee": duty.employee, "date": ["between", [first, last]]}
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

	return (
		frappe.get_doc(
			{
				"doctype": "Duty Reporting",
				"sop": duty.sop,
				"employee": duty.employee,
				"date": first,
				"actions": ACTIONS,
			}
		)
		.insert()
		.name
	)


def _reportings_by_sop(employee: str, periods: dict) -> dict:
	"""SOP -> the oldest of `employee`'s Duty Reportings on it in its period, by name and
	with its counts (see _reportings). `periods` is SOP -> its period's (first, last).
	"""
	if not periods:
		return {}

	# Grouped, so the query has a term per period, not per SOP.
	sops_by_period = {}
	for sop, period in periods.items():
		sops_by_period.setdefault(period, []).append(sop)

	rows = _reportings(
		("name", "sop"),
		lambda row: (row.employee == employee)
		& reduce(
			or_,
			(row.sop.isin(sops) & row.date.between(*period) for period, sops in sops_by_period.items()),
		),
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
