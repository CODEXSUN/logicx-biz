import frappe
from frappe import _

from logicx_biz.logicx_hr.doctype.enquiry_status.enquiry_status import (
	get_status_bucket_map,
	get_status_groups,
)

OTHER_BUCKET = "other"


def execute(filters=None):
	filters = frappe._dict(filters or {})
	status_groups = get_status_groups()
	return get_columns(status_groups), get_data(filters, status_groups)


def get_columns(status_groups):
	columns = [
		{"label": _("List in"), "fieldname": "group", "fieldtype": "Data", "width": 150},
	]
	for status_group in status_groups:
		columns.append(
			{
				"label": _(status_group),
				"fieldname": frappe.scrub(status_group),
				"fieldtype": "Int",
				"width": 90,
			}
		)
	columns.append({"label": _("Other"), "fieldname": OTHER_BUCKET, "fieldtype": "Int", "width": 90})
	columns.append({"label": _("Total"), "fieldname": "total", "fieldtype": "Int", "width": 150})
	return columns


def get_data(filters, status_groups):
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

	status_buckets = get_status_bucket_map()
	buckets = [frappe.scrub(status_group) for status_group in status_groups] + [OTHER_BUCKET]

	groups = {}
	for row in rows:
		group_label = row.group or _("(no group)")
		bucket = status_buckets.get(row.status, OTHER_BUCKET)
		bucket_counts = groups.setdefault(group_label, {})
		bucket_counts[bucket] = bucket_counts.get(bucket, 0) + row.count

	data = []
	for group_label in sorted(groups):
		bucket_counts = groups[group_label]
		row = {"group": group_label}
		total = 0
		for bucket in buckets:
			count = bucket_counts.get(bucket, 0)
			row[bucket] = count or None
			total += count
		row["total"] = total or None
		data.append(row)

	return data
