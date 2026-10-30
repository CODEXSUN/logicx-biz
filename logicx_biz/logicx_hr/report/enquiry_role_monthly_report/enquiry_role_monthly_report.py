import datetime

import frappe
from frappe import _
from frappe.utils import cint, get_last_day

from logicx_biz.logicx_hr.doctype.enquiry_daily_role.enquiry_daily_role import JOB_ASSIGNEE, LEAD_CREATOR


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"label": _("Date"), "fieldname": "date", "fieldtype": "Date", "width": 110},
		{"label": _("Jobs"), "fieldname": "jobs", "fieldtype": "Int", "width": 90},
		{"label": _("Leads"), "fieldname": "leads", "fieldtype": "Int", "width": 90},
	]


def get_data(filters):
	year, month = cint(filters.get("year")), cint(filters.get("month"))
	if not 1 <= year <= 9999 or not 1 <= month <= 12:
		frappe.throw(_("Pick a Year and a Month."))

	from_date = datetime.date(year, month, 1)
	conditions = ["`date` BETWEEN %(from_date)s AND %(to_date)s"]
	params = {
		"from_date": from_date,
		"to_date": get_last_day(from_date),
		"job_assignee": JOB_ASSIGNEE,
		"lead_creator": LEAD_CREATOR,
	}

	if filters.get("member"):
		conditions.append("`member` = %(member)s")
		params["member"] = filters["member"]

	rows = frappe.db.sql(
		f"""
		SELECT
			`date`,
			SUM(CASE WHEN `role` = %(job_assignee)s THEN 1 ELSE 0 END) AS jobs,
			SUM(CASE WHEN `role` = %(lead_creator)s THEN 1 ELSE 0 END) AS leads
		FROM `tabEnquiry Daily Role`
		WHERE {' AND '.join(conditions)}
		GROUP BY `date`
		ORDER BY `date`
		""",
		params,
		as_dict=True,
	)

	return [
		{"date": row.date, "jobs": cint(row.jobs) or None, "leads": cint(row.leads) or None} for row in rows
	]
