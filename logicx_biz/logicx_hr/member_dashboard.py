"""Server side of the Member Dashboard (page/member_dashboard/member_dashboard_view),
which two pages build:

- the Member Dashboard (page/member_dashboard), on any member: the Employee
  picked on the page, which only PAGE_ROLES may name;
- the Member Self Dashboard (page/member_self_dashboard), on the member looking
  at it: the Employee whose User is the one logged in.

`get_tab` names the member and lists what one of the dashboard's tabs holds
for them:

- Jobs, the Enquiries assigned to them, or Leads, the ones they created --
  newest first, with the closed ones (a Status in the Closed group) left out
  until the tab's "Show Closed" box is ticked;
- Duty, the SOPs assigned to them as Duties -- by Index, narrowed by the tab's
  Department and Frequency boxes.

The rows are read through `frappe.get_list`, so a user sees only what their own
permissions allow, whoever the member is.
"""

import frappe
from frappe import _
from frappe.utils import escape_html

# the roles the Member Dashboard is limited to (page/member_dashboard.json): only
# they may name the member a tab is read for. the Member Self Dashboard names
# none, and is answered for the logged-in user's own Employee.
PAGE_ROLES = ("System Manager", "TM Admin")

# which Enquiries Jobs and Leads list: the ones whose field named here is the
# member. keyed as the page's TABS are.
TAB_FIELDS = {
	# the work handed to the member
	"jobs": "assigned_to_employee",
	# the work the member brought in: user_employee is the Employee who created
	# the Enquiry (see Enquiry.before_validate)
	"leads": "user_employee",
}

# the Status Group a tab leaves out until its "Show Closed" box is ticked: every
# Enquiry Status in it -- Won, Lost, Closed and Duplicate as seeded (see
# patches/create_enquiry_statuses.py), and any put in it since
CLOSED_GROUP = "Closed"

# newest first, on Jobs and Leads
ORDER_BY = "creation desc"

# the tab that lists the member's Duties: the ones whose User is the member
DUTY_TAB = "duty"

# by Index, the order the member's Duties are numbered in
DUTY_ORDER_BY = "index asc"

# the most rows a tab lists. one more is read, so the page can tell a tab cut
# short here from one that happens to hold exactly this many.
ROW_LIMIT = 500

# what each tab reads; the Customer and both Employees gain their names
# alongside (see _enquiry_view). a tuple, and handed to get_list as a fresh
# list: get_list may rework the list it is given in place, which on a shared one
# would carry into the next request.
ENQUIRY_FIELDS = (
	"name",
	"date",
	"title",
	"customer",
	"group",
	"user_employee",
	"assigned_to_employee",
	"status",
	# no column of its own, but where a click on the row goes: the Mobile
	# Dashboard, on this number
	"mobile",
)

# what the Duty tab reads, as ENQUIRY_FIELDS is read. SOP Name, Department and
# Frequency are the SOP's, fetched onto the Duty.
DUTY_FIELDS = (
	"name",
	"index",
	"sop_name",
	"department",
	"frequency",
	# no columns of their own, but where a click on the row goes: the Duty
	# Reporting list, filtered by both
	"user",
	"sop",
)


@frappe.whitelist()
def get_tab(
	tab: str,
	show_closed: bool = False,
	member: str | None = None,
	department: str | None = None,
	frequency: str | None = None,
) -> dict:
	"""The member, and the rows `tab` lists for them.

	The member is `member`, an Employee ID, when one is named -- by PAGE_ROLES
	only -- and the Employee linked to the logged-in User when none is.
	`employee` is None, and nothing else is read, when there is no such
	Employee. Otherwise `rows` holds the tab's rows -- for Jobs and Leads the
	Enquiries, the closed ones only with `show_closed`; for Duty the Duties, only
	those of `department` and `frequency` when given -- and `more` says they
	were cut at ROW_LIMIT. Each tab reads only its own boxes' arguments.
	"""
	if tab not in TAB_FIELDS and tab != DUTY_TAB:
		frappe.throw(_("Unknown tab: {0}").format(escape_html(tab)))

	if member:
		frappe.only_for(PAGE_ROLES)
		employee = _employee(member)
	else:
		employee = _current_employee()
	if not employee:
		return {"employee": None}

	if tab == DUTY_TAB:
		rows = _duties(employee.name, department, frequency)
	else:
		rows = _enquiries(tab, employee.name, show_closed)
	return {
		"employee": employee.name,
		"employee_name": employee.employee_name or employee.name,
		"rows": rows[:ROW_LIMIT],
		"more": len(rows) > ROW_LIMIT,
	}


def _enquiries(tab: str, employee: str, show_closed: bool) -> list:
	"""Up to ROW_LIMIT + 1 of the Enquiries Jobs or Leads lists for `employee`."""
	filters = {TAB_FIELDS[tab]: employee}
	if not show_closed:
		closed = _closed_statuses()
		# no Status in the group, nothing to leave out
		if closed:
			filters["status"] = ("not in", closed)

	rows = frappe.get_list(
		"Enquiry",
		filters=filters,
		fields=list(ENQUIRY_FIELDS),
		order_by=ORDER_BY,
		limit=ROW_LIMIT + 1,
	)
	return _enquiry_view(rows)


def _duties(employee: str, department: str | None, frequency: str | None) -> list:
	"""Up to ROW_LIMIT + 1 of `employee`'s Duties, narrowed to `department` and
	`frequency` when given. Each is matched on the Duty's own copy of its SOP's.
	"""
	filters = {"user": employee}
	department = (department or "").strip()
	frequency = (frequency or "").strip()
	if department:
		filters["department"] = department
	if frequency:
		filters["frequency"] = frequency

	return frappe.get_list(
		"Duty",
		filters=filters,
		fields=list(DUTY_FIELDS),
		order_by=DUTY_ORDER_BY,
		limit=ROW_LIMIT + 1,
	)


def _current_employee() -> frappe._dict | None:
	"""The Employee whose User is the one logged in, by ID and name.

	Looked up as Enquiry.before_validate looks up the creator it stamps as
	user_employee, so Leads lists exactly what was stamped for the member.
	"""
	return frappe.db.get_value(
		"Employee", {"user_id": frappe.session.user}, ["name", "employee_name"], as_dict=True
	)


def _employee(member: str) -> frappe._dict | None:
	"""The Employee `member`, by ID and name, as _current_employee gives it."""
	return frappe.db.get_value("Employee", member, ["name", "employee_name"], as_dict=True)


def _closed_statuses() -> list:
	"""The Enquiry Statuses in CLOSED_GROUP, read afresh each time, so a Status
	moved into or out of the group counts from the next read on.

	get_all, as a member needs no permission on Enquiry Status for their own
	Enquiries to be filtered by it.
	"""
	return frappe.get_all("Enquiry Status", filters={"status_group": CLOSED_GROUP}, pluck="name")


def _enquiry_view(rows: list) -> list:
	"""Enquiry rows with the Customer, creator and assignee by name."""
	customers = _titles("Customer", "customer_name", [row.customer for row in rows])
	employees = _titles(
		"Employee",
		"employee_name",
		[row.user_employee for row in rows] + [row.assigned_to_employee for row in rows],
	)
	for row in rows:
		row.customer_name = customers.get(row.customer) or row.customer
		row.created_by_name = employees.get(row.user_employee) or row.user_employee
		row.assigned_to_name = employees.get(row.assigned_to_employee) or row.assigned_to_employee
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
