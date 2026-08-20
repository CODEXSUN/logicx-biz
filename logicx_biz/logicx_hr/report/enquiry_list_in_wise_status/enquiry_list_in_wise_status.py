import frappe
from frappe import _

STATUS_BUCKETS = {
	"new": ["New", "Escalation", "Re-open", "Long Hold"],
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
		{"label": _("List in"), "fieldname": "group", "fieldtype": "Data", "width": 150},
		{"label": _("New"), "fieldname": "new", "fieldtype": "Int", "width": 90},
		{"label": _("Open"), "fieldname": "open", "fieldtype": "Int", "width": 90},
		{"label": _("Hold"), "fieldname": "hold", "fieldtype": "Int", "width": 90},
		{"label": _("Won"), "fieldname": "won", "fieldtype": "Int", "width": 90},
		{"label": _("Lost"), "fieldname": "lost", "fieldtype": "Int", "width": 90},
		{"label": _("Other"), "fieldname": "other", "fieldtype": "Int", "width": 90},
		{"label": _("Total"), "fieldname": "total", "fieldtype": "Int", "width": 150},
	]
	return columns


def get_data(filters):
	conditions = []
	params = {}

	if filters.get("from_date"):
		conditions.append("`date` >= %(from_date)s")
		params["from_date"] = filters["from_date"]
	if filters.get("to_date"):
		conditions.append("`date` <= %(to_date)s")
		params["to_date"] = filters["to_date"]
	if filters.get("assigned_to_employee"):
		conditions.append("`assigned_to_employee` = %(assigned_to_employee)s")
		params["assigned_to_employee"] = filters["assigned_to_employee"]

	where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

	rows = frappe.db.sql(
		f"""
		SELECT `group`, `status`, COUNT(*) AS count
		FROM `tabEnquiry`
		{where_clause}
		GROUP BY `group`, `status`
		""",
		params,
		as_dict=True,
	)

	groups = {}
	for row in rows:
		group_label = row.group or _("(no group)")
		bucket = STATUS_TO_BUCKET.get(row.status, "other")
		bucket_counts = groups.setdefault(group_label, {})
		bucket_counts[bucket] = bucket_counts.get(bucket, 0) + row.count

	data = []
	for group_label in sorted(groups):
		bucket_counts = groups[group_label]
		row = {"group": group_label}
		total = 0
		for bucket in list(STATUS_BUCKETS) + ["other"]:
			count = bucket_counts.get(bucket, 0)
			row[bucket] = count or None
			total += count
		row["total"] = total or None
		data.append(row)

	return data
