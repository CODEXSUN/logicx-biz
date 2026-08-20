import frappe
from frappe import _

STATUS_BUCKETS = {
	"open": ["Open"],
	"hold": ["Hold for Approval", "Hold for Spares", "Hold for Job-Out"],
	"won": ["Won"],
	"lost": ["Lost"],
}

STATUS_TO_BUCKET = {
	status: fieldname for fieldname, statuses in STATUS_BUCKETS.items() for status in statuses
}


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	columns = [
		{"label": _("Assigned To"), "fieldname": "assigned_to", "fieldtype": "Data", "width": 150},
		{"label": _("Open"), "fieldname": "open", "fieldtype": "Int", "width": 90},
		{"label": _("Hold"), "fieldname": "hold", "fieldtype": "Int", "width": 90},
		# {"label": _("Won"), "fieldname": "won", "fieldtype": "Int", "width": 90},
		# {"label": _("Lost"), "fieldname": "lost", "fieldtype": "Int", "width": 90},
		# {"label": _("Other"), "fieldname": "other", "fieldtype": "Int", "width": 90},
		# {"label": _("Total"), "fieldname": "total", "fieldtype": "Int", "width": 150},
	]
	return columns


def get_data(filters):
	conditions = []
	params = {}

	if filters.get("from_date"):
		conditions.append("enq.`date` >= %(from_date)s")
		params["from_date"] = filters["from_date"]
	if filters.get("to_date"):
		conditions.append("enq.`date` <= %(to_date)s")
		params["to_date"] = filters["to_date"]
	if filters.get("group"):
		conditions.append("enq.`group` = %(group)s")
		params["group"] = filters["group"]

	where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

	rows = frappe.db.sql(
		f"""
		SELECT enq.assigned_to_employee, emp.employee_name, enq.status, COUNT(*) AS count
		FROM `tabEnquiry` enq
		LEFT JOIN `tabEmployee` emp ON emp.name = enq.assigned_to_employee
		{where_clause}
		GROUP BY enq.assigned_to_employee, emp.employee_name, enq.status
		""",
		params,
		as_dict=True,
	)

	owners = {}
	for row in rows:
		owner_label = row.employee_name or row.assigned_to_employee or _("(unassigned)")
		bucket = STATUS_TO_BUCKET.get(row.status, "other")
		bucket_counts = owners.setdefault(owner_label, {})
		bucket_counts[bucket] = bucket_counts.get(bucket, 0) + row.count

	data = []
	for owner_label in sorted(owners):
		bucket_counts = owners[owner_label]
		row = {"assigned_to": owner_label}
		total = 0
		for bucket in list(STATUS_BUCKETS) + ["other"]:
			count = bucket_counts.get(bucket, 0)
			row[bucket] = count or None
			total += count
		row["total"] = total or None
		data.append(row)

	return data
