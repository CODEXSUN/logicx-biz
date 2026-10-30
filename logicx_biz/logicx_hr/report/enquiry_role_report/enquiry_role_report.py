import calendar

import frappe
from frappe import _
from frappe.utils import cint

from logicx_biz.logicx_hr.doctype.enquiry_daily_role.enquiry_daily_role import JOB_ASSIGNEE, LEAD_CREATOR


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	# Year and Month are Data, so the total row adds up Jobs and Leads only
	return [
		{"label": _("Year"), "fieldname": "year", "fieldtype": "Data", "width": 90},
		{"label": _("Month"), "fieldname": "month", "fieldtype": "Data", "width": 120},
		{"label": _("Jobs"), "fieldname": "jobs", "fieldtype": "Int", "width": 90},
		{"label": _("Leads"), "fieldname": "leads", "fieldtype": "Int", "width": 90},
	]


def get_data(filters):
	conditions = []
	params = {"job_assignee": JOB_ASSIGNEE, "lead_creator": LEAD_CREATOR}

	if filters.get("member"):
		conditions.append("`member` = %(member)s")
		params["member"] = filters["member"]

	where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

	rows = frappe.db.sql(
		f"""
		SELECT
			YEAR(`date`) AS year,
			MONTH(`date`) AS month,
			SUM(CASE WHEN `role` = %(job_assignee)s THEN 1 ELSE 0 END) AS jobs,
			SUM(CASE WHEN `role` = %(lead_creator)s THEN 1 ELSE 0 END) AS leads
		FROM `tabEnquiry Daily Role`
		{where_clause}
		GROUP BY YEAR(`date`), MONTH(`date`)
		ORDER BY year, month
		""",
		params,
		as_dict=True,
	)

	return [
		{
			"year": str(row.year),
			"month": _(calendar.month_name[row.month]),
			"jobs": cint(row.jobs) or None,
			"leads": cint(row.leads) or None,
		}
		for row in rows
	]
