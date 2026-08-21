import frappe
from frappe import _

from logicx_biz.logicx_hr.doctype.enquiry_status.enquiry_status import (
	get_status_bucket_map,
	get_status_groups,
)

OTHER_BUCKET = "other"

# Every group is counted, but only these are shown -- the report is used as a
# live workload view, so the closed work is deliberately left out (see the
# commented-out columns in get_columns).
VISIBLE_GROUPS = ["Pending", "Hold"]


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	columns = [
		{"label": _("Assigned To"), "fieldname": "assigned_to", "fieldtype": "Data", "width": 150},
	]
	for status_group in VISIBLE_GROUPS:
		columns.append(
			{
				"label": _(status_group),
				"fieldname": frappe.scrub(status_group),
				"fieldtype": "Int",
				"width": 90,
			}
		)
	# {"label": _("New"), "fieldname": "new", "fieldtype": "Int", "width": 90},
	# {"label": _("Closed"), "fieldname": "closed", "fieldtype": "Int", "width": 90},
	# {"label": _("Other"), "fieldname": "other", "fieldtype": "Int", "width": 90},
	# {"label": _("Total"), "fieldname": "total", "fieldtype": "Int", "width": 150},
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

	status_buckets = get_status_bucket_map()
	buckets = [frappe.scrub(status_group) for status_group in get_status_groups()] + [OTHER_BUCKET]

	owners = {}
	for row in rows:
		owner_label = row.employee_name or row.assigned_to_employee or _("(unassigned)")
		bucket = status_buckets.get(row.status, OTHER_BUCKET)
		bucket_counts = owners.setdefault(owner_label, {})
		bucket_counts[bucket] = bucket_counts.get(bucket, 0) + row.count

	data = []
	for owner_label in sorted(owners):
		bucket_counts = owners[owner_label]
		row = {"assigned_to": owner_label}
		total = 0
		for bucket in buckets:
			count = bucket_counts.get(bucket, 0)
			row[bucket] = count or None
			total += count
		row["total"] = total or None
		data.append(row)

	return data
