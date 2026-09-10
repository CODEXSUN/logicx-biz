"""Stock on hand split by the vendor we bought it from.

Batch.vendor (see logicx_biz/logicx_erp/batch.py) records who a batch was
purchased from, so every batched stock movement can be attributed to a vendor.
This report rolls the stock ledger up to one row per vendor + item.

Stock that carries no vendor -- non-batched items, and batches created before
the vendor stamp existed -- is still reported, under a blank Vendor, so the
totals reconcile with the plain stock reports instead of silently losing rows.
"""

import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{
			"label": _("Vendor ID"),
			"fieldname": "vendor",
			"fieldtype": "Link",
			"options": "Supplier",
			"width": 90,
		},
		{
			"label": _("Vendor Name"),
			"fieldname": "vendor_name",
			"fieldtype": "Data",
			"width": 200,
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

	# every word must match, but each word may match any of the six fields
	for idx, word in enumerate(filters.get("search_text", "").split(), start=1):
		key = f"search_word_{idx}"
		conditions.append(
			f"""(stk.vendor LIKE %({key})s
				OR sup.supplier_name LIKE %({key})s
				OR it.item_name LIKE %({key})s
				OR it.item_group LIKE %({key})s
				OR it.brand LIKE %({key})s
				OR it.description LIKE %({key})s)"""
		)
		params[key] = f"%{word}%"

	# reads the stk aggregate rather than tabItem, but belongs in the same outer WHERE because stk is joined there
	if filters.get("in_stock_only"):
		conditions.append("stk.balance_qty > 0")

	# warehouse must be applied inside the ledger sub-selects, not the outer WHERE, so it narrows what is aggregated per vendor rather than dropping whole rows afterwards
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

	query = f"""
		SELECT
			stk.vendor AS vendor,
			sup.supplier_name AS vendor_name,
			it.item_group AS item_group,
			it.brand AS brand,
			it.name AS item_code,
			it.item_name AS item_name,
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
				SUM(CASE WHEN led.qty > 0 THEN led.qty ELSE 0 END) AS inward_qty,
				SUM(led.qty) AS balance_qty,
				SUM(led.value) AS balance_value
			FROM ({get_batch_ledger(warehouse_condition)}) led
			GROUP BY led.vendor, led.item_code
		) stk ON stk.item_code = it.name

		LEFT JOIN `tabSupplier` sup ON sup.name = stk.vendor

		LEFT JOIN (
			SELECT parent, item_tax_template
			FROM `tabItem Tax`
			WHERE parenttype = 'Item' AND parentfield = 'taxes' AND idx = 1
		) fit ON fit.parent = it.name

		LEFT JOIN `tabItem Tax Template` itt ON itt.name = fit.item_tax_template

		WHERE {" AND ".join(conditions)}

		ORDER BY stk.vendor IS NULL, stk.vendor, it.item_group, it.item_name, it.name
		"""

	return frappe.db.sql(query, params, as_dict=True)


def get_batch_ledger(warehouse_condition: str) -> str:
	"""Stock ledger flattened to (vendor, item_code, qty, value) rows.

	ERPNext writes a movement's batch either onto the ledger entry itself
	(Stock Ledger Entry.batch_no) or, since v15, into a Serial and Batch Bundle
	whose child rows carry one batch each. Both shapes have to be read to see
	every batch's movements, so each becomes one branch of a UNION ALL.
	"""
	has_bundle = frappe.db.has_column(
		"Stock Ledger Entry", "serial_and_batch_bundle"
	) and frappe.db.table_exists("Serial and Batch Entry")

	# a bundle is wholly inward or wholly outward, so take the direction off the
	# ledger entry rather than trusting the sign a given version stores on the
	# child row (outward rows are negative in v15, but is_outward has also been
	# used to carry the direction beside a positive qty)
	bundle_qty = "CASE WHEN sle.actual_qty < 0 THEN -ABS(sbe.qty) ELSE ABS(sbe.qty) END"

	# the ledger entry holds the whole voucher line's value, so a bundle row's
	# share of it comes off the child row when ERPNext stored it there -- which
	# keeps batches bought at different rates apart -- and is otherwise
	# apportioned by quantity
	bundle_value = f"({bundle_qty}) * sle.stock_value_difference / NULLIF(sle.actual_qty, 0)"
	if has_bundle and frappe.db.has_column("Serial and Batch Entry", "stock_value_difference"):
		bundle_value = f"COALESCE(sbe.stock_value_difference, {bundle_value})"

	# entries with neither a batch nor a bundle -- non-batched items -- come
	# through this branch too, with a NULL vendor from the LEFT JOIN
	branches = [
		f"""
			SELECT
				b.vendor AS vendor,
				sle.item_code AS item_code,
				sle.actual_qty AS qty,
				sle.stock_value_difference AS value
			FROM `tabStock Ledger Entry` sle
			LEFT JOIN `tabBatch` b ON b.name = sle.batch_no
			WHERE sle.is_cancelled = 0
				AND sle.docstatus = 1
				{"AND COALESCE(sle.serial_and_batch_bundle, '') = ''" if has_bundle else ""}
				{warehouse_condition}
		"""
	]

	if has_bundle:
		branches.append(
			f"""
			SELECT
				b.vendor AS vendor,
				sle.item_code AS item_code,
				{bundle_qty} AS qty,
				{bundle_value} AS value
			FROM `tabStock Ledger Entry` sle
			JOIN `tabSerial and Batch Entry` sbe ON sbe.parent = sle.serial_and_batch_bundle
			LEFT JOIN `tabBatch` b ON b.name = sbe.batch_no
			WHERE sle.is_cancelled = 0
				AND sle.docstatus = 1
				AND COALESCE(sle.serial_and_batch_bundle, '') <> ''
				{warehouse_condition}
		"""
		)

	return " UNION ALL ".join(branches)
