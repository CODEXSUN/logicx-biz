import frappe
from frappe import _
from frappe.utils import strip_html


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{
			"label": _("Item Group"),
			"fieldname": "item_group",
			"fieldtype": "Link",
			"options": "Item Group",
			"width": 130,
		},
		{
			"label": _("Brand"),
			"fieldname": "brand",
			"fieldtype": "Link",
			"options": "Brand",
			"width": 120,
		},
		{
			"label": _("Item ID"),
			"fieldname": "item_code",
			"fieldtype": "Link",
			"options": "Item",
			"width": 80,
		},
		{
			"label": _("Item Name"),
			"fieldname": "item_name",
			"fieldtype": "Data",
			"width": 260,
		},
		{
			"label": "Opening<br>Qty",
			"fieldname": "opening_qty",
			"fieldtype": "Int",
			"precision": 2,
			"width": 80,
		},
		{
			"label": "In<br>Qty",
			"fieldname": "in_qty",
			"fieldtype": "Int",
			"precision": 2,
			"width": 60,
		},
		{
			"label": "Out<br>Qty",
			"fieldname": "out_qty",
			"fieldtype": "Int",
			"precision": 2,
			"width": 60,
		},
		{
			"label": "Stock<br>Qty",
			"fieldname": "balance_qty",
			"fieldtype": "Int",
			"precision": 2,
			"width": 80,
		},
		# {
		# 	"label": _("Reserved Stock"),
		# 	"fieldname": "reserved_stock",
		# 	"fieldtype": "Int",
		# 	"precision": 2,
		# 	"width": 120,
		# },
		{
			"label": _("UOM"),
			"fieldname": "stock_uom",
			"fieldtype": "Link",
			"options": "UOM",
			"width": 70,
		},
		{
			"label": _("Valuation<br>Rate"),
			"fieldname": "valuation_rate",
			"fieldtype": "Currency",
			"precision": 2,
			"disable_total": 1,
			"width": 110,
		},
		{
			"label": _("Valuation<br>Net Rate"),
			"fieldname": "valuation_net_rate",
			"fieldtype": "Currency",
			"precision": 2,
			"disable_total": 1,
			"width": 110,
		},
		{
			"label": _("Item Description"),
			"fieldname": "description",
			"fieldtype": "Data",
			"align": "left",
			"width": 330,
		},
		{
			"label": _("HSN Code"),
			"fieldname": "gst_hsn_code",
			"fieldtype": "Link",
			"options": "GST HSN Code",
			"align": "center",
			"width": 110,
		},
		{
			"label": _("Tax Rate"),
			"fieldname": "tax_rate",
			"fieldtype": "Percent",
			"precision": 2,
			"disable_total": 1,
			"align": "center",
			"width": 90,
		},
		{
			"label": _("Opening<br>Value"),
			"fieldname": "opening_value",
			"fieldtype": "Int",
			"width": 90,
		},
		{
			"label": _("In<br>Value"),
			"fieldname": "in_value",
			"fieldtype": "Int",
			"width": 80,
		},
		{
			"label": _("Out<br>Value"),
			"fieldname": "out_value",
			"fieldtype": "Int",
			"width": 80,
		},
		{
			"label": _("Stock<br>Value"),
			"fieldname": "balance_value",
			"fieldtype": "Int",
			"width": 90,
		},
	]


def get_data(filters):
	if not filters.get("from_date") or not filters.get("to_date"):
		frappe.throw(_("From Date and To Date are mandatory"))

	item_conditions = [
		"it.disabled = 0",
		"it.is_stock_item = 1",
		"it.has_variants = 0",
	]
	params = {
		"from_date": filters["from_date"],
		"to_date": filters["to_date"],
	}

	if filters.get("item_group"):
		item_conditions.append(
			"""it.item_group IN (
				SELECT ig.name FROM `tabItem Group` ig
				WHERE ig.lft >= (SELECT lft FROM `tabItem Group` WHERE name = %(item_group)s)
					AND ig.rgt <= (SELECT rgt FROM `tabItem Group` WHERE name = %(item_group)s)
			)"""
		)
		params["item_group"] = filters["item_group"]

	if filters.get("brand"):
		item_conditions.append("it.brand = %(brand)s")
		params["brand"] = filters["brand"]

	if filters.get("item_code"):
		item_conditions.append("it.name = %(item_code)s")
		params["item_code"] = filters["item_code"]

	# every word must match, but each word may match any of the four fields
	for idx, word in enumerate(filters.get("search_text", "").split(), start=1):
		key = f"search_word_{idx}"
		item_conditions.append(
			f"""(it.item_name LIKE %({key})s
				OR it.item_group LIKE %({key})s
				OR it.brand LIKE %({key})s
				OR it.description LIKE %({key})s)"""
		)
		params[key] = f"%{word}%"

	# these read the stk aggregate rather than tabItem, but belong in the same outer WHERE because stk is joined there
	if filters.get("in_stock_only") and filters.get("has_transactions_only"):
		item_conditions.append("(stk.balance_qty > 0 OR stk.in_qty <> 0 OR stk.out_qty <> 0)")
	elif filters.get("in_stock_only"):
		item_conditions.append("stk.balance_qty > 0")
	elif filters.get("has_transactions_only"):
		item_conditions.append("(stk.in_qty <> 0 OR stk.out_qty <> 0)")

	# warehouse must be applied inside the stock/reservation sub-selects, not the outer WHERE, otherwise it turns the LEFT JOIN into an inner join and drops items that have no stock at all
	# Tree-aware filters: Warehouse (and Item Group) is nested-set tree, so picking a group node must include its descendants (plain = would silently return nothing for a group warehouse):
	sle_warehouse_condition = ""
	sre_warehouse_condition = ""
	if filters.get("warehouse"):
		params["warehouse"] = filters["warehouse"]
		sle_warehouse_condition = """AND warehouse IN (
			SELECT w.name FROM `tabWarehouse` w
			WHERE w.lft >= (SELECT lft FROM `tabWarehouse` WHERE name = %(warehouse)s)
				AND w.rgt <= (SELECT rgt FROM `tabWarehouse` WHERE name = %(warehouse)s)
		)"""
		sre_warehouse_condition = """AND sre.warehouse IN (
			SELECT w.name FROM `tabWarehouse` w
			WHERE w.lft >= (SELECT lft FROM `tabWarehouse` WHERE name = %(warehouse)s)
				AND w.rgt <= (SELECT rgt FROM `tabWarehouse` WHERE name = %(warehouse)s)
		)"""

	# gst_hsn_code / gst_rate are india-compliance custom fields, not core ERPNext;
	# degrade to NULL instead of failing the query when that app isn't installed
	hsn_code_select = "it.gst_hsn_code" if frappe.db.has_column("Item", "gst_hsn_code")          else "NULL"
	tax_rate_select = "itt.gst_rate"    if frappe.db.has_column("Item Tax Template", "gst_rate") else "NULL"

	query = f"""
		SELECT
			it.name AS item_code,
			it.item_name AS item_name,
			it.item_group AS item_group,
			it.brand AS brand,
			it.stock_uom AS stock_uom,
			NULLIF(stk.opening_qty, 0) AS opening_qty,
			NULLIF(stk.in_qty, 0) AS in_qty,
			NULLIF(stk.out_qty, 0) AS out_qty,
			stk.balance_qty,
			res.reserved_stock AS reserved_stock,
			stk.balance_value / NULLIF(stk.balance_qty, 0) AS valuation_rate,
			stk.balance_value / NULLIF(stk.balance_qty, 0) * (100 + COALESCE({tax_rate_select}, 0)) / 100 AS valuation_net_rate,
			NULLIF(ROUND(stk.opening_value, 0), 0) AS opening_value,
			NULLIF(ROUND(stk.in_value, 0), 0) AS in_value,
			NULLIF(ROUND(stk.out_value, 0), 0) AS out_value,
			NULLIF(ROUND(stk.balance_value, 0), 0) AS balance_value,
			{tax_rate_select} AS tax_rate,
			{hsn_code_select} AS gst_hsn_code,
			it.description AS description
		FROM `tabItem` it

		JOIN (
			SELECT
				item_code,
				SUM(CASE WHEN posting_date < %(from_date)s THEN actual_qty ELSE 0 END) AS opening_qty,
				SUM(CASE WHEN posting_date >= %(from_date)s AND actual_qty > 0 THEN actual_qty ELSE 0 END) AS in_qty,
				ABS(SUM(CASE WHEN posting_date >= %(from_date)s AND actual_qty < 0 THEN actual_qty ELSE 0 END)) AS out_qty,
				SUM(actual_qty) AS balance_qty,
				SUM(CASE WHEN posting_date < %(from_date)s THEN stock_value_difference ELSE 0 END) AS opening_value,
				SUM(CASE WHEN posting_date >= %(from_date)s AND actual_qty > 0 THEN stock_value_difference ELSE 0 END) AS in_value,
				ABS(SUM(CASE WHEN posting_date >= %(from_date)s AND actual_qty < 0 THEN stock_value_difference ELSE 0 END)) AS out_value,
				SUM(stock_value_difference) AS balance_value
			FROM `tabStock Ledger Entry`
			WHERE is_cancelled = 0
				AND docstatus = 1
				AND posting_date <= %(to_date)s
				{sle_warehouse_condition}
			GROUP BY item_code
		) stk ON stk.item_code = it.name

		LEFT JOIN (
			SELECT
				sre.item_code,
				SUM(sre.reserved_qty - sre.delivered_qty) AS reserved_stock
			FROM `tabStock Reservation Entry` sre
			WHERE sre.docstatus = 1
				AND sre.status NOT IN ('Closed', 'Delivered')
				AND sre.delivered_qty < sre.reserved_qty
				{sre_warehouse_condition}
			GROUP BY sre.item_code
		) res ON res.item_code = it.name

		LEFT JOIN (
			SELECT parent, item_tax_template
			FROM `tabItem Tax`
			WHERE parenttype = 'Item' AND parentfield = 'taxes' AND idx = 1
		) fit ON fit.parent = it.name

		LEFT JOIN `tabItem Tax Template` itt ON itt.name = fit.item_tax_template

		WHERE {" AND ".join(item_conditions)}

		ORDER BY it.item_group, it.item_name, it.name
		"""

	data = frappe.db.sql(query, params, as_dict=True)
	for row in data:
		row.description = strip_html(row.description or "")
	return data
