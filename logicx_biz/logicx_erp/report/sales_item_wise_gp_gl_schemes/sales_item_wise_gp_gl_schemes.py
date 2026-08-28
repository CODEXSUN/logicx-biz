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
			"label": _("Item Code"),
			"fieldname": "item_code",
			"fieldtype": "Link",
			"options": "Item",
			"width": 100,
		},
		{
			"label": _("Item Name"),
			"fieldname": "item_name",
			"fieldtype": "Data",
			"width": 180,
		},
		{
			"label": _("Buying Rate"),
			"fieldname": "buying_rate",
			"fieldtype": "Float",
			"precision": 2,
			"disable_total": 1,
			"width": 100,
		},
		{
			"label": _("Selling Rate"),
			"fieldname": "selling_rate",
			"fieldtype": "Float",
			"precision": 2,
			"disable_total": 1,
			"width": 100,
		},
		{
			"label": _("Qty"),
			"fieldname": "qty",
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
			"label": _("GP %"),
			"fieldname": "gross_profit_percent",
			"fieldtype": "Percent",
			"precision": 2,
			"disable_total": 1,
			"width": 80,
		},
		{
			"label": _("GL"),
			"fieldname": "gross_loss",
			"fieldtype": "Int",
			"width": 120,
		},
		{
			"label": _("GL %"),
			"fieldname": "gross_loss_percent",
			"fieldtype": "Percent",
			"precision": 2,
			"disable_total": 1,
			"width": 80,
		},
		{
			"label": _("Schemes"),
			"fieldname": "schemes",
			"fieldtype": "Int",
			"width": 120,
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

	if filters.get("invoice_number"):
		conditions.append("sh.name = %(invoice_number)s")
		params["invoice_number"] = filters["invoice_number"]

	if filters.get("customer_code"):
		conditions.append("sh.customer = %(customer_code)s")
		params["customer_code"] = filters["customer_code"]

	if filters.get("sales_person"):
		conditions.append("st.sales_person = %(sales_person)s")
		params["sales_person"] = filters["sales_person"]

	if filters.get("item_code"):
		conditions.append("si.item_code = %(item_code)s")
		params["item_code"] = filters["item_code"]

	return frappe.db.sql(
		f"""
		SELECT
			sss.invoice_number,
			sss.invoice_date,
			sss.customer_code,
			sss.customer_name,
			sss.sales_person,
			sss.invoice_value,
			sss.item_name,
			sss.item_code,
			sss.qty,
			sss.buying_rate,
			sss.selling_rate,
			NULLIF( CASE WHEN sss.profit_or_loss > 0 THEN CAST( sss.profit_or_loss      AS INTEGER) ELSE 0 END ,0) AS gross_profit,
			NULLIF( CASE WHEN sss.profit_or_loss < 0 THEN CAST( sss.profit_or_loss * -1 AS INTEGER) ELSE 0 END ,0) AS gross_loss,
			NULLIF( CASE WHEN sss.profit_or_loss_percent > 0 THEN sss.profit_or_loss_percent      ELSE 0 END ,0) AS gross_profit_percent,
			NULLIF( CASE WHEN sss.profit_or_loss_percent < 0 THEN sss.profit_or_loss_percent * -1 ELSE 0 END ,0) AS gross_loss_percent,
			NULLIF( sc.schemes ,0) AS schemes
		FROM  (
			SELECT
				sh.name AS invoice_number,
				sh.posting_date as invoice_date,
				sh.customer AS customer_code,
				sh.customer_name,
				st.sales_person,
				sh.rounded_total as invoice_value,
				si.item_name,
				si.item_code,
				si.qty,
				zsi.buying_rate,
				si.base_net_rate as selling_rate,
				(ABS(si.qty) * si.base_net_rate) - (ABS(si.qty) * zsi.buying_rate) AS profit_or_loss,
				ROUND( (si.base_net_rate * 100.0 / zsi.buying_rate) - 100 ,2) AS profit_or_loss_percent
			FROM `tabSales Invoice` sh
				LEFT JOIN (SELECT parent, sales_person FROM `tabSales Team` where idx = 1) st ON sh.name = st.parent
				LEFT JOIN `tabSales Invoice Item` si ON sh.name = si.parent
				LEFT JOIN (
					SELECT  si.name AS sales_invoice_item_id,
							CASE WHEN IFNULL(si.stock_qty, 0) <> 0
								 	THEN sle.buying_amount / ABS( si.stock_qty )
							     	ELSE sle.buying_amount
							     END AS buying_rate
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
		ORDER BY
			sss.invoice_number,
			sss.item_code
		""",
		params,
		as_dict=True,
	)
