"""Server side of the Members page (page/members).

The page lists the active Employees -- Status Active -- by name, A to Z, and
narrows them by the Search box above the list: it keeps the Employees whose
Name, Email (their User ID), Department or Designation holds what was typed
anywhere in it. A click on a row opens the Member Dashboard on it (see
member_dashboard.py).

The Employees are read through `frappe.get_list`, so a user sees only the ones
their own permissions allow.
"""

import frappe

from logicx_biz.logicx_hr.mobile_dashboard import ROW_LIMIT, _tab

# by name, A to Z
ORDER_BY = "employee_name asc"

# what the list shows. a tuple, handed to get_list as a fresh list, for the
# reason mobile_dashboard.py gives.
EMPLOYEE_FIELDS = (
	"name",
	"employee_name",
	"cell_number",
	# the Employee's User, which is their email
	"user_id",
	"attendance_device_id",
	"department",
	"designation",
)

# where the Search box looks: an Employee matches when any one of these holds
# what was typed
SEARCH_FIELDS = ("employee_name", "user_id", "department", "designation")


@frappe.whitelist()
def get_members(search: str | None = None) -> dict:
	"""The active Employees whose Name, Email, Department or Designation holds
	`search`, by name.

	An empty one leaves the list unfiltered. `rows` holds the Employees, and
	`more` says they were cut at ROW_LIMIT.
	"""
	search = (search or "").strip()
	or_filters = {fieldname: ("like", f"%{search}%") for fieldname in SEARCH_FIELDS} if search else None

	rows = frappe.get_list(
		"Employee",
		filters={"status": "Active"},
		or_filters=or_filters,
		fields=list(EMPLOYEE_FIELDS),
		order_by=ORDER_BY,
		limit=ROW_LIMIT + 1,
	)
	return _tab(rows)
