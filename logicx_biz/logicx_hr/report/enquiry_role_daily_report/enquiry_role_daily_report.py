import frappe
from frappe import _

from logicx_biz.logicx_hr.doctype.enquiry_daily_role.enquiry_daily_role import JOB_ASSIGNEE, LEAD_CREATOR


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"label": _("Employee"), "fieldname": "employee", "fieldtype": "Data", "width": 180},
		{"label": _("Job"), "fieldname": "job", "fieldtype": "Link", "options": "Enquiry", "width": 120},
		{"label": _("Lead"), "fieldname": "lead", "fieldtype": "Link", "options": "Enquiry", "width": 120},
	]


def get_data(filters):
	if not filters.get("date"):
		frappe.throw(_("Pick a Date."))

	conditions = ["edr.`date` = %(date)s"]
	params = {"date": filters["date"]}

	if filters.get("member"):
		conditions.append("edr.`member` = %(member)s")
		params["member"] = filters["member"]

	# per member, the jobs first, then the leads ("Job Assignee" sorts before
	# "Lead Creator"), each in the order its Enquiry came in
	rows = frappe.db.sql(
		f"""
		SELECT edr.`member`, emp.employee_name, edr.`role`, edr.enquiry
		FROM `tabEnquiry Daily Role` edr
		LEFT JOIN `tabEmployee` emp ON emp.name = edr.`member`
		LEFT JOIN `tabEnquiry` enq ON enq.name = edr.enquiry
		WHERE {' AND '.join(conditions)}
		ORDER BY emp.employee_name, edr.`member`, edr.`role`, enq.creation
		""",
		params,
		as_dict=True,
	)

	# one row per role an Enquiry gives a member: its id under Job or under Lead
	return [
		{
			"employee": row.employee_name or row.member,
			"job": row.enquiry if row.role == JOB_ASSIGNEE else None,
			"lead": row.enquiry if row.role == LEAD_CREATOR else None,
		}
		for row in rows
	]
