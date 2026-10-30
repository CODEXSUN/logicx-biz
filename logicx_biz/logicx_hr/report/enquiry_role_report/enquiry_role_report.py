import frappe
from frappe import _

from logicx_biz.logicx_hr.doctype.enquiry_daily_role.enquiry_daily_role import JOB_ASSIGNEE, LEAD_CREATOR


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"label": _("Date"), "fieldname": "date", "fieldtype": "Date", "width": 100},
		{"label": _("Job"), "fieldname": "job", "fieldtype": "Link", "options": "Enquiry", "width": 90},
		{"label": _("Assigned To"), "fieldname": "assigned_to", "fieldtype": "Data", "width": 160},
		{"label": _("Lead"), "fieldname": "lead", "fieldtype": "Link", "options": "Enquiry", "width": 90},
		{"label": _("Lead By"), "fieldname": "lead_by", "fieldtype": "Data", "width": 160},
		{"label": _("List in"), "fieldname": "group", "fieldtype": "Link", "options": "Enquiry Group", "width": 120},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Link", "options": "Enquiry Status", "width": 120},
		{"label": _("Title"), "fieldname": "title", "fieldtype": "Data", "width": 300},
	]


def get_data(filters):
	# Date or Member, either one will do; with neither, nothing is fetched
	if not filters.get("date") and not filters.get("member"):
		return []

	conditions = []
	params = {}

	if filters.get("date"):
		conditions.append("edr.`date` = %(date)s")
		params["date"] = filters["date"]
	if filters.get("member"):
		conditions.append("edr.`member` = %(member)s")
		params["member"] = filters["member"]

	# per date and member, the jobs first, then the leads ("Job Assignee" sorts
	# before "Lead Creator"), each in the order its Enquiry came in
	rows = frappe.db.sql(
		f"""
		SELECT
			edr.`date`, edr.`role`, edr.enquiry,
			asg.employee_name AS assigned_to_name, enq.assigned_to_employee,
			ldb.employee_name AS lead_by_name, enq.user_employee,
			enq.`group`, enq.status, enq.title
		FROM `tabEnquiry Daily Role` edr
		LEFT JOIN `tabEnquiry` enq ON enq.name = edr.enquiry
		LEFT JOIN `tabEmployee` asg ON asg.name = enq.assigned_to_employee
		LEFT JOIN `tabEmployee` ldb ON ldb.name = enq.user_employee
		WHERE {' AND '.join(conditions)}
		ORDER BY edr.`date`, edr.`member`, edr.`role`, enq.creation
		""",
		params,
		as_dict=True,
	)

	# one row per role an Enquiry gives a member: its id under Job, with the
	# Enquiry's Assigned To, or under Lead, with its Lead By
	data = []
	for row in rows:
		is_job, is_lead = row.role == JOB_ASSIGNEE, row.role == LEAD_CREATOR
		data.append(
			{
				"date": row.date,
				"job": row.enquiry if is_job else None,
				"assigned_to": (row.assigned_to_name or row.assigned_to_employee) if is_job else None,
				"lead": row.enquiry if is_lead else None,
				"lead_by": (row.lead_by_name or row.user_employee) if is_lead else None,
				"group": row.group,
				"status": row.status,
				"title": row.title,
			}
		)
	return data
