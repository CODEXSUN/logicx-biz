"""Vendor Stock, one row per batch instead of one per item.

The Vendor Stock report rolls the stock ledger up to vendor + item; this one
stops a level earlier, at vendor + item + batch, so a vendor's stock can be read
as the individual lots it arrived in -- and, with Batch.manufacturing_date, how
long each of those lots has been sitting.

`get_batch_ledger` is shared with that report (see vendor_stock.py) so both see
the stock ledger the same way; only the GROUP BY below differs.

Stock that carries no batch -- non-batched items, and any ledger entry written
before the batch was stamped -- is still reported, under a blank Batch and a
blank Vendor, so the totals reconcile with Vendor Stock and the plain stock
reports instead of silently losing rows.
"""

import frappe
from frappe import _

from logicx_biz.logicx_erp.report.vendor_stock.vendor_stock import get_batch_ledger


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{
			"label": _("Vendor"),
			"fieldname": "vendor",
			"fieldtype": "Link",
			"options": "Supplier",
			"width": 90,
		},
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
			"label": _("Batch"),
			"fieldname": "batch_no",
			"fieldtype": "Link",
			"options": "Batch",
			"width": 140,
		},
		{
			# days since the batch was made, not since it arrived: manufacturing_date
			# is what Batch records, and batch.py seeds nothing else that dates a lot
			"label": _("Age"),
			"fieldname": "age",
			"fieldtype": "Int",
			# a column of day counts has no meaningful sum
			"disable_total": 1,
			"width": 60,
		},
		{
			"label": "Inward<br>Qty",
			"fieldname": "inward_qty",
			"fieldtype": "Int",
			"precision": 2,
			"width": 80,
		},
		{
			"label": "Stock<br>Qty",
			"fieldname": "balance_qty",
			"fieldtype": "Int",
			"precision": 2,
			"width": 80,
		},
		{
			"label": _("Stock<br>Value"),
			"fieldname": "balance_value",
			"fieldtype": "Currency",
			# rounded to whole units in SQL as well, so the export matches what is
			# shown; the js formatter drops the decimals the currency format adds
			"precision": 0,
			"width": 110,
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
	]


def get_data(filters):
	conditions = [
		"it.disabled = 0",
		"it.is_stock_item = 1",
		"it.has_variants = 0",
	]
	params = {}

	if filters.get("vendor"):
		conditions.append("stk.vendor = %(vendor)s")
		params["vendor"] = filters["vendor"]

	if filters.get("item_group"):
		conditions.append(
			"""it.item_group IN (
				SELECT ig.name FROM `tabItem Group` ig
				WHERE ig.lft >= (SELECT lft FROM `tabItem Group` WHERE name = %(item_group)s)
					AND ig.rgt <= (SELECT rgt FROM `tabItem Group` WHERE name = %(item_group)s)
			)"""
		)
		params["item_group"] = filters["item_group"]

	if filters.get("brand"):
		conditions.append("it.brand = %(brand)s")
		params["brand"] = filters["brand"]

	if filters.get("item_code"):
		conditions.append("it.name = %(item_code)s")
		params["item_code"] = filters["item_code"]

	# the batch is part of what the ledger is grouped by, so narrowing it out here
	# drops whole rows without disturbing what the rest of them add up to
	if filters.get("batch_no"):
		conditions.append("stk.batch_no = %(batch_no)s")
		params["batch_no"] = filters["batch_no"]

	# every word must match, but each word may match any of the seven fields
	for idx, word in enumerate(filters.get("search_text", "").split(), start=1):
		key = f"search_word_{idx}"
		conditions.append(
			f"""(stk.vendor LIKE %({key})s
				OR sup.supplier_name LIKE %({key})s
				OR it.item_name LIKE %({key})s
				OR it.item_group LIKE %({key})s
				OR it.brand LIKE %({key})s
				OR stk.batch_no LIKE %({key})s
				OR it.description LIKE %({key})s)"""
		)
		params[key] = f"%{word}%"

	# reads the stk aggregate rather than tabItem, but belongs in the same outer WHERE because stk is joined there
	if filters.get("in_stock_only"):
		conditions.append("stk.balance_qty > 0")

	# warehouse must be applied inside the ledger sub-selects, not the outer WHERE, so it narrows what is aggregated per batch rather than dropping whole rows afterwards
	# Warehouse is a nested-set tree, so picking a group node must include its descendants (plain = would silently return nothing for a group warehouse):
	warehouse_condition = ""
	if filters.get("warehouse"):
		params["warehouse"] = filters["warehouse"]
		warehouse_condition = """AND sle.warehouse IN (
			SELECT w.name FROM `tabWarehouse` w
			WHERE w.lft >= (SELECT lft FROM `tabWarehouse` WHERE name = %(warehouse)s)
				AND w.rgt <= (SELECT rgt FROM `tabWarehouse` WHERE name = %(warehouse)s)
		)"""

	# gst_rate is an india-compliance custom field, not core ERPNext;
	# degrade to NULL instead of failing the query when that app isn't installed
	tax_rate_select = "itt.gst_rate" if frappe.db.has_column("Item Tax Template", "gst_rate") else "NULL"

	# Batch is named by its batch_id, so the tabBatch join below can only ever
	# match one row -- it narrows nothing and multiplies nothing
	query = f"""
		SELECT
			stk.vendor AS vendor,
			it.item_group AS item_group,
			it.brand AS brand,
			it.name AS item_code,
			it.item_name AS item_name,
			stk.batch_no AS batch_no,
			DATEDIFF(CURDATE(), bat.manufacturing_date) AS age,
			NULLIF(stk.inward_qty, 0) AS inward_qty,
			stk.balance_qty AS balance_qty,
			NULLIF(ROUND(stk.balance_value, 0), 0) AS balance_value,
			stk.balance_value / NULLIF(stk.balance_qty, 0) AS valuation_rate,
			stk.balance_value / NULLIF(stk.balance_qty, 0) * (100 + COALESCE({tax_rate_select}, 0)) / 100 AS valuation_net_rate
		FROM `tabItem` it

		JOIN (
			SELECT
				led.vendor AS vendor,
				led.item_code AS item_code,
				led.batch_no AS batch_no,
				SUM(CASE WHEN led.qty > 0 THEN led.qty ELSE 0 END) AS inward_qty,
				SUM(led.qty) AS balance_qty,
				SUM(led.value) AS balance_value
			FROM ({get_batch_ledger(warehouse_condition)}) led
			GROUP BY led.vendor, led.item_code, led.batch_no
		) stk ON stk.item_code = it.name

		LEFT JOIN `tabBatch` bat ON bat.name = stk.batch_no

		LEFT JOIN `tabSupplier` sup ON sup.name = stk.vendor

		LEFT JOIN (
			SELECT parent, item_tax_template
			FROM `tabItem Tax`
			WHERE parenttype = 'Item' AND parentfield = 'taxes' AND idx = 1
		) fit ON fit.parent = it.name

		LEFT JOIN `tabItem Tax Template` itt ON itt.name = fit.item_tax_template

		WHERE {" AND ".join(conditions)}

		ORDER BY stk.vendor IS NULL, stk.vendor, it.item_group, it.item_name, it.name,
			bat.manufacturing_date IS NULL, bat.manufacturing_date, stk.batch_no
		"""

	return frappe.db.sql(query, params, as_dict=True)
