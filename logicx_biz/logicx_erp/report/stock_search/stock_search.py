import frappe
from frappe import _
from frappe.utils import strip_html


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		# {
		# 	"label": _("Item Group"),
		# 	"fieldname": "item_group",
		# 	"fieldtype": "Link",
		# 	"options": "Item Group",
		# 	"width": 130,
		# },
		# {
		# 	"label": _("Brand"),
		# 	"fieldname": "brand",
		# 	"fieldtype": "Link",
		# 	"options": "Brand",
		# 	"width": 120,
		# },
		{
			"label": _("Item"),
			"fieldname": "item_code",		# item_name has no column of its own; the js formatter appends it to this cell
			"fieldtype": "Link",
			"options": "Item",
			"width": 330,
		},
		# {
		# 	"label": _("Item Name"),
		# 	"fieldname": "item_name",
		# 	"fieldtype": "Data",
		# 	"width": 260,
		# },
		{
			"label": _("Stock"),
			"fieldname": "balance_qty",
			"fieldtype": "Int",
			"precision": 2,
			"width": 80,
		},
		# {
		# 	"label": _("Valuation Rate"),
		# 	"fieldname": "valuation_rate",
		# 	"fieldtype": "Currency",
		# 	"precision": 2,
		# 	"disable_total": 1,
		# 	"width": 120,
		# },
		{
			"label": _("Tax"),
			"fieldname": "tax_rate",
			"fieldtype": "Int",
			"disable_total": 1,
			"align": "center",
			"width": 60,
		},
		{
			"label": _("Landed Rate"),
			"fieldname": "valuation_net_rate",
			"fieldtype": "Int",
			"disable_total": 1,
			"width": 110,
		},
		{
			"label": _("Description"),
			"fieldname": "description",
			"fieldtype": "Data",
			"align": "left",
			"width": 330,
		},
	]


def get_data(filters):
	item_conditions = [
		"it.disabled = 0",
		"it.is_stock_item = 1",
		"it.has_variants = 0",
	]
	params = {}

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

	# reads the stk aggregate rather than tabItem, but belongs in the same outer WHERE because stk is joined there
	if filters.get("in_stock_only"):
		item_conditions.append("stk.balance_qty > 0")

	# gst_rate is an india-compliance custom field, not core ERPNext;
	# degrade to NULL instead of failing the query when that app isn't installed
	tax_rate_select = "itt.gst_rate" if frappe.db.has_column("Item Tax Template", "gst_rate") else "NULL"

	query = f"""
		SELECT
			it.item_group AS item_group,
			it.brand AS brand,
			it.name AS item_code,
			it.item_name AS item_name,
			stk.balance_qty AS balance_qty,
			stk.balance_value / NULLIF(stk.balance_qty, 0) AS valuation_rate,
			{tax_rate_select} AS tax_rate,
			stk.balance_value / NULLIF(stk.balance_qty, 0) * (100 + COALESCE({tax_rate_select}, 0)) / 100 AS valuation_net_rate,
			it.description AS description
		FROM `tabItem` it

		LEFT JOIN (
			SELECT
				item_code,
				SUM(actual_qty) AS balance_qty,
				SUM(stock_value_difference) AS balance_value
			FROM `tabStock Ledger Entry`
			WHERE is_cancelled = 0
				AND docstatus = 1
			GROUP BY item_code
		) stk ON stk.item_code = it.name

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
