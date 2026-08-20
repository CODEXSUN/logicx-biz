import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{
			"label": _("Invoice Number"),
			"fieldname": "invoice_number",
			"fieldtype": "Link",
			"options": "Sales Invoice",
			"width": 140,
		},
		{
			"label": _("Date"),
			"fieldname": "invoice_date",
			"fieldtype": "Date",
			"width": 110,
		},
		{
			"label": _("Customer Code"),
			"fieldname": "customer_code",
			"fieldtype": "Link",
			"options": "Customer",
			"width": 100,
		},
		{
			"label": _("Customer Name"),
			"fieldname": "customer_name",
			"fieldtype": "Data",
			"width": 180,
		},
		{
			"label": _("Sales Person"),
			"fieldname": "sales_person",
			"fieldtype": "Link",
			"options": "Sales Person",
			"width": 120,
		},
		{
			"label": _("Invoice Value"),
			"fieldname": "invoice_value",
			"fieldtype": "Int",
			"width": 120,
		},
		{
			"label": _("Total Qty"),
			"fieldname": "total_qty",
			"fieldtype": "Int",
			"disable_total": 1,
			"width": 90,
		},
		{
			"label": _("GP"),
			"fieldname": "gross_profit",
			"fieldtype": "Int",
			"width": 120,
		},
		{
			"label": _("GL"),
			"fieldname": "gross_loss",
			"fieldtype": "Int",
			"width": 120,
		},
		{
			"label": _("Schemes"),
			"fieldname": "schemes",
			"fieldtype": "Int",
			"width": 120,
		},
		{
			"label": _("Nett P/L"),
			"fieldname": "nett",
			"fieldtype": "Int",
			"width": 120,
		},
		{
			"label": _("P/L %"),
			"fieldname": "profit_or_loss_percent",
			"fieldtype": "Percent",
			"precision": 2,
			"disable_total": 1,
			"width": 80,
		},
	]


def get_data(filters):
	conditions = ["sh.docstatus = 1"]
	params = {}

	if filters.get("from_date"):
		conditions.append("sh.posting_date >= %(from_date)s")
		params["from_date"] = filters["from_date"]

	if filters.get("to_date"):
		conditions.append("sh.posting_date <= %(to_date)s")
		params["to_date"] = filters["to_date"]

	if filters.get("customer_code"):
		conditions.append("sh.customer = %(customer_code)s")
		params["customer_code"] = filters["customer_code"]

	if filters.get("sales_person"):
		conditions.append("st.sales_person = %(sales_person)s")
		params["sales_person"] = filters["sales_person"]

	return frappe.db.sql(
		f"""
		SELECT
			sss.invoice_number,
			sss.invoice_date,
			sss.customer_code,
			sss.customer_name,
			sss.sales_person,
			sss.invoice_value,
			SUM(sss.qty) AS total_qty,
			NULLIF( CASE WHEN SUM(sss.profit_or_loss) > 0 THEN CAST( SUM(sss.profit_or_loss)      AS INTEGER) ELSE 0 END ,0) AS gross_profit,
			NULLIF( CASE WHEN SUM(sss.profit_or_loss) < 0 THEN CAST( SUM(sss.profit_or_loss) * -1 AS INTEGER) ELSE 0 END ,0) AS gross_loss,
			NULLIF( sc.schemes ,0) AS schemes,
			NULLIF(
				CAST(
					  COALESCE( CASE WHEN SUM(sss.profit_or_loss) > 0 THEN SUM(sss.profit_or_loss)      ELSE 0 END ,0)
					- COALESCE( CASE WHEN SUM(sss.profit_or_loss) < 0 THEN SUM(sss.profit_or_loss) * -1 ELSE 0 END ,0)
					+ COALESCE( sc.schemes ,0)
				AS INTEGER)
			,0) AS nett,
			ROUND( (SUM(sss.selling_amount) * 100.0 / SUM(sss.buying_amount)) - 100 ,2) AS profit_or_loss_percent
		FROM  (
			SELECT
				sh.name AS invoice_number,
				sh.posting_date as invoice_date,
				sh.customer AS customer_code,
				sh.customer_name,
				st.sales_person,
				sh.rounded_total as invoice_value,
				si.qty,
				zsi.buying_amount,
				(ABS(si.qty) * si.base_net_rate) AS selling_amount,
				(ABS(si.qty) * si.base_net_rate) - (zsi.buying_amount) AS profit_or_loss
			FROM `tabSales Invoice` sh
				LEFT JOIN (SELECT parent, sales_person FROM `tabSales Team` where idx = 1) st ON sh.name = st.parent
				LEFT JOIN `tabSales Invoice Item` si ON sh.name = si.parent
				LEFT JOIN (
					SELECT  si.name AS sales_invoice_item_id, sle.buying_amount
					FROM `tabSales Invoice Item` si
						LEFT JOIN (
							SELECT voucher_type, voucher_detail_no, ABS( -1 * SUM(stock_value_difference) ) AS buying_amount
							FROM `tabStock Ledger Entry`
							GROUP BY voucher_type, voucher_detail_no
						) sle ON (
									( sle.voucher_type = 'Delivery Note'
									  AND sle.voucher_detail_no = si.dn_detail )
									OR
									( sle.voucher_type = 'Sales Invoice'
									  AND sle.voucher_detail_no = si.name )
								 )
					GROUP BY si.name
				) zsi on si.name = zsi.sales_invoice_item_id
			WHERE {" AND ".join(conditions)}
		) sss
		LEFT JOIN (
			SELECT invoice_number, SUM(support_value) as schemes
			FROM tabScheme
			WHERE docstatus in (0, 1)
			GROUP BY invoice_number
		) sc on sss.invoice_number = sc.invoice_number
		GROUP BY
			sss.invoice_number,
			sss.invoice_date,
			sss.customer_code,
			sss.customer_name,
			sss.sales_person,
			sss.invoice_value
		ORDER BY
			sss.invoice_number
		""",
		params,
		as_dict=True,
	)
