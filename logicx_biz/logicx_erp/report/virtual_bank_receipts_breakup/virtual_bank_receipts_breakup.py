import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{
			"label": _("Source"),
			"fieldname": "source",
			"fieldtype": "Data",
			"width": 120,
		},
		{
			"label": _("Payment ID"),
			"fieldname": "payment_id",
			"fieldtype": "Dynamic Link",
			"options": "source",
			"width": 140,
		},
		{
			"label": _("Posting Date"),
			"fieldname": "posting_date",
			"fieldtype": "Date",
			"width": 120,
		},
		{
			"label": _("Party"),
			"fieldname": "party",
			"fieldtype": "Link",
			"options": "Customer",
			"width": 80,
		},
		{
			"label": _("Party Name"),
			"fieldname": "party_name",
			"fieldtype": "Data",
			"width": 160,
		},
		{
			"label": _("Mode of Payment"),
			"fieldname": "mode_of_payment",
			"fieldtype": "Data",
			"width": 150,
		},
		{
			"label": _("Against Invoice"),
			"fieldname": "sales_invoice",
			"fieldtype": "Link",
			"options": "Sales Invoice",
			"width": 140,
		},
		{
			"label": _("Paid Amount"),
			"fieldname": "paid_amount",
			"fieldtype": "Currency",
			"width": 140,
		},
	]


def get_data(filters):
	if not filters.get("posting_date"):
		frappe.throw(_("Posting Date is mandatory"))

	pe_conditions = ""
	si_conditions = ""
	if filters.get("mode_of_payment"):
		pe_conditions += " AND pe.mode_of_payment = %(mode_of_payment)s"
		si_conditions += " AND sip.mode_of_payment = %(mode_of_payment)s"
	if filters.get("party"):
		pe_conditions += " AND pe.party = %(party)s"
		si_conditions += " AND si.customer = %(party)s"

	return frappe.db.sql(
		f"""
		SELECT
			'Payment Entry' AS source,
			pe.name AS payment_id,
			pe.posting_date,
			pe.party,
			pe.party_name,
			pe.mode_of_payment,
			per.reference_name AS sales_invoice,
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
			{pe_conditions}

		UNION ALL

		SELECT
			'Sales Invoice' AS source,
			si.name AS payment_id,
			si.posting_date,
			si.customer AS party,
			si.customer_name AS party_name,
			sip.mode_of_payment,
			si.name AS sales_invoice,
			sip.amount AS paid_amount
		FROM
			`tabSales Invoice Payment` sip
		INNER JOIN
			`tabSales Invoice` si
				ON sip.parent = si.name
		WHERE
			si.docstatus = 1
			AND si.posting_date = %(posting_date)s
			{si_conditions}

		ORDER BY
			mode_of_payment, sales_invoice
		""",
		{
			"posting_date": filters.get("posting_date"),
			"mode_of_payment": filters.get("mode_of_payment"),
			"party": filters.get("party"),
		},
		as_dict=True,
	)
