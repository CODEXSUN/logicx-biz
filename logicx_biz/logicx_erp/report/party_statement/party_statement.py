import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{
			"label": _("Date"),
			"fieldname": "posting_date",
			"fieldtype": "Date",
			"width": 110,
		},
		{
			"label": _("Voucher No."),
			"fieldname": "voucher_no",
			"fieldtype": "Dynamic Link",
			"options": "voucher_type",
			"width": 160,
		},
		# {
		# 	"label": _("Voucher Type"),
		# 	"fieldname": "voucher_type",
		# 	"fieldtype": "Data",
		# 	"width": 140,
		# },
		{
			"label": _("Type"),
			"fieldname": "voucher_subtype",
			"fieldtype": "Data",
			"width": 140,
		},
		{
			"label": _("Debit"),
			"fieldname": "debit",
			"fieldtype": "Currency",
			"width": 140,
		},
		{
			"label": _("Credit"),
			"fieldname": "credit",
			"fieldtype": "Currency",
			"width": 140,
		},
	]


def get_data(filters):
	if not filters.get("party"):
		frappe.throw(_("Party is mandatory"))

	data = frappe.db.sql(
		"""
		SELECT
			voucher_type,
			voucher_subtype,
			voucher_no,
			posting_date,
			NULLIF(SUM(gle.debit), 0) AS debit,
			NULLIF(SUM(gle.credit), 0) AS credit
		FROM `tabGL Entry` gle
		WHERE gle.party = %(party)s
			AND gle.party_type = %(party_type)s
			AND gle.is_cancelled = 0
		GROUP BY
			voucher_type,
			voucher_subtype,
			voucher_no,
			posting_date
		ORDER BY
			posting_date,
			MAX(modified)
		""",
		{
			"party": filters.get("party"),
			"party_type": filters.get("party_type") or "Customer",
		},
		as_dict=True,
	)

	if data:
		total_debit = sum(row.debit or 0 for row in data)
		total_credit = sum(row.credit or 0 for row in data)
		balance = total_debit - total_credit

		data.append(
			{
				"voucher_subtype": _("Total"),
				"debit": total_debit,
				"credit": total_credit,
				"bold": 1,
			}
		)
		data.append(
			{
				"voucher_subtype": _("Closing Balance"),
				"debit": balance if balance > 0 else None,
				"credit": -balance if balance < 0 else None,
				"bold": 1,
			}
		)

	return data
