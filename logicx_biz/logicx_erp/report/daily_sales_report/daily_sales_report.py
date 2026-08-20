import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{
			"label": _("Invoice Date"),
			"fieldname": "invoice_date",
			"fieldtype": "Date",
			"width": 110,
		},
		{
			"label": _("Invoice No."),
			"fieldname": "invoice_no",
			"fieldtype": "Link",
			"options": "Sales Invoice",
			"width": 120,
		},
		{
			"label": _("POS Profile"),
			"fieldname": "pos_profile",
			"fieldtype": "Data",
			"width": 110,
		},
		{
			"label": _("Sales Person"),
			"fieldname": "sales_person",
			"fieldtype": "Data",
			"width": 120,
		},
		{
			"label": _("Party"),
			"fieldname": "party",
			"fieldtype": "Link",
			"options": "Customer",
			"width": 90,
		},
		{
			"label": _("Party Name"),
			"fieldname": "party_name",
			"fieldtype": "Data",
			"width": 160,
		},
		{
			"label": _("Invoice Amount"),
			"fieldname": "invoice_amount",
			"fieldtype": "Int",
			"width": 130,
		},
		{
			"label": _("Cash"),
			"fieldname": "cash",
			"fieldtype": "Int",
			"width": 80,
		},
		{
			"label": _("PayTM"),
			"fieldname": "paytm",
			"fieldtype": "Int",
			"width": 80,
		},
		{
			"label": _("Others"),
			"fieldname": "others",
			"fieldtype": "Int",
			"width": 80,
		},
		{
			"label": _("Advance"),
			"fieldname": "advances",
			"fieldtype": "Int",
			"width": 90,
		},
		{
			"label": _("Pending"),
			"fieldname": "pending",
			"fieldtype": "Int",
			"width": 110,
		},
		{
			"label": _("Outstanding"),
			"fieldname": "outstanding",
			"fieldtype": "Currency",
			"width": 120,
		},
		{
			"label": _("Above 30 days"),
			"fieldname": "above_30_days",
			"fieldtype": "Currency",
			"width": 130,
		},
	]


def get_data(filters):
	if not filters.get("posting_date"):
		frappe.throw(_("Date is mandatory"))

	conditions = [
		"si.docstatus = 1",
		"si.posting_date = %(posting_date)s",
	]
	params = {"posting_date": filters.get("posting_date")}

	if filters.get("pos_profile"):
		conditions.append("si.pos_profile = %(pos_profile)s")
		params["pos_profile"] = filters["pos_profile"]

	if filters.get("sales_person"):
		conditions.append("st.sales_person = %(sales_person)s")
		params["sales_person"] = filters["sales_person"]

	if filters.get("party"):
		conditions.append("si.customer = %(party)s")
		params["party"] = filters["party"]

	return frappe.db.sql(
		f"""
		SELECT
			si.posting_date AS invoice_date,
			si.name AS invoice_no,
			si.pos_profile AS pos_profile,
			MAX(st.sales_person) AS sales_person,
			si.customer AS party,
			si.customer_name AS party_name,
			ROUND(si.grand_total, 0) AS invoice_amount,

			NULLIF(ROUND(SUM(
				CASE WHEN pay.payment_date = si.posting_date AND pay.mode = 'Cash Store'
					THEN pay.amount ELSE 0 END
			), 0), 0) AS cash,

			NULLIF(ROUND(SUM(
				CASE WHEN pay.payment_date = si.posting_date AND pay.mode LIKE '%%Paytm%%'
					THEN pay.amount ELSE 0 END
			), 0), 0) AS paytm,

			NULLIF(ROUND(SUM(
				CASE WHEN pay.payment_date = si.posting_date
					AND pay.mode <> 'Cash Store'
					AND pay.mode NOT LIKE '%%Paytm%%'
					THEN pay.amount ELSE 0 END
			), 0), 0) AS others,

			NULLIF(ROUND(SUM(
				CASE WHEN pay.payment_date < si.posting_date
					THEN pay.amount ELSE 0 END
			), 0), 0) AS advances,

			ROUND(si.outstanding_amount, 0) AS pending,
			ROUND(MAX(COALESCE(gl.customer_outstanding, 0)), 0) AS outstanding,
			ROUND(MAX(COALESCE(age30.customer_outstanding_above_30_days, 0)), 0) AS above_30_days

		FROM `tabSales Invoice` si

		LEFT JOIN (
			SELECT parent, sales_person
			FROM `tabSales Team`
			WHERE idx = 1
		) st ON st.parent = si.name

		LEFT JOIN (
			SELECT
				per.reference_name AS sales_invoice,
				pe.posting_date AS payment_date,
				per.allocated_amount AS amount,
				pe.mode_of_payment AS mode
			FROM `tabPayment Entry` pe
			INNER JOIN `tabPayment Entry Reference` per
				ON per.parent = pe.name
			WHERE pe.docstatus = 1
				AND per.reference_doctype = 'Sales Invoice'

			UNION ALL

			SELECT
				sip.parent AS sales_invoice,
				sinv.posting_date AS payment_date,
				sip.amount AS amount,
				sip.mode_of_payment AS mode
			FROM `tabSales Invoice Payment` sip
			INNER JOIN `tabSales Invoice` sinv
				ON sinv.name = sip.parent
			WHERE sinv.docstatus = 1
		) pay ON pay.sales_invoice = si.name

		LEFT JOIN (
			SELECT
				party,
				SUM(debit) - SUM(credit) AS customer_outstanding
			FROM `tabGL Entry`
			WHERE party_type = 'Customer'
				AND docstatus = 1
				AND is_cancelled = 0
			GROUP BY party
		) gl ON gl.party = si.customer

		LEFT JOIN (
			SELECT
				customer,
				SUM(outstanding_amount) AS customer_outstanding_above_30_days
			FROM `tabSales Invoice`
			WHERE docstatus = 1
				AND outstanding_amount > 0
				AND DATEDIFF(CURDATE(), COALESCE(due_date, posting_date)) > 30
			GROUP BY customer
		) age30 ON age30.customer = si.customer

		WHERE {" AND ".join(conditions)}

		GROUP BY
			si.name,
			si.posting_date,
			si.pos_profile,
			si.customer,
			si.customer_name,
			si.grand_total,
			si.outstanding_amount

		ORDER BY
			gl.customer_outstanding DESC, si.posting_date, si.name
		""",
		params,
		as_dict=True,
	)
