import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{
			"label": _("Mode of Payment"),
			"fieldname": "mode_of_payment",
			"fieldtype": "Link",
			"options": "Mode of Payment",
			"width": 200,
		},
		{
			"label": _("Total Paid Amount"),
			"fieldname": "total_paid_amount",
			"fieldtype": "Currency",
			"width": 160,
		},
	]


def get_data(filters):
	if not filters.get("posting_date"):
		frappe.throw(_("Posting Date is mandatory"))

	return frappe.db.sql(
		"""
		SELECT
			t.mode_of_payment,
			SUM(t.paid_amount) AS total_paid_amount
		FROM
		(
			SELECT
				pe.mode_of_payment,
				COALESCE(per.allocated_amount, pe.paid_amount) AS paid_amount
			FROM
				`tabPayment Entry` pe
			LEFT JOIN
				`tabPayment Entry Reference` per
					ON per.parent = pe.name
			WHERE
				pe.payment_type = 'Receive'
				AND pe.docstatus = 1
				AND pe.posting_date = %(posting_date)s

			UNION ALL

			SELECT
				sip.mode_of_payment,
				sip.amount AS paid_amount
			FROM
				`tabSales Invoice` si
			INNER JOIN
				`tabSales Invoice Payment` sip
					ON sip.parent = si.name
			WHERE
				si.docstatus = 1
				AND si.posting_date = %(posting_date)s
		) t
		GROUP BY
			t.mode_of_payment
		ORDER BY
			t.mode_of_payment
		""",
		{"posting_date": filters.get("posting_date")},
		as_dict=True,
	)
