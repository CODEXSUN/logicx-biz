"""Stock on hand, one row per batch, newest batch first, with the batch's own details.

Vendor Stock rolls the stock ledger up to vendor + item; this report stops a
level earlier, at the batch, and lays the Batch record out beside its stock:
the voucher that created it (reference_doctype / reference_name), its dates,
the pricing batch.py seeds onto it from that voucher, and who created it and
when. Batches are listed newest first, so the latest arrivals are on top.

`get_batch_ledger` is shared with Vendor Stock (see vendor_stock.py) so both
reports see the stock ledger the same way; only the GROUP BY below differs.

Stock that carries no batch -- non-batched items -- is still reported, under a
blank Batch after every batched row, so the totals reconcile with Vendor Stock
and the plain stock reports instead of silently losing rows.
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
			"label": _("Batch"),
			"fieldname": "batch_no",
			"fieldtype": "Link",
			"options": "Batch",
			"width": 140,
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
		# ---- the Batch record itself ----
		{
			# Data rather than Link: a Link to DocType would open the doctype's
			# definition, which is no use here (and Source Doc Name already links
			# to the voucher)
			"label": _("Source<br>Doc Type"),
			"fieldname": "reference_doctype",
			"fieldtype": "Data",
			"width": 130,
		},
		{
			"label": _("Source<br>Doc Name"),
			"fieldname": "reference_name",
			"fieldtype": "Dynamic Link",
			"options": "reference_doctype",
			"width": 150,
		},
		# {
		# 	# the batch's quantity across every warehouse, so it is not narrowed by
		# 	# the Warehouse filter the way Stock Qty is; each batch is one row, so
		# 	# the column still totals without counting a batch twice
		# 	"label": _("Batch<br>Qty"),
		# 	"fieldname": "batch_qty",
		# 	"fieldtype": "Int",
		# 	"precision": 2,
		# 	"width": 80,
		# },
		{
			"label": _("Manufacturing<br>Date"),
			"fieldname": "manufacturing_date",
			"fieldtype": "Date",
			"width": 110,
		},
		{
			"label": _("Expiry<br>Date"),
			"fieldname": "expiry_date",
			"fieldtype": "Date",
			"width": 100,
		},
		# a column of unit prices has no meaningful sum
		{
			"label": _("MRP"),
			"fieldname": "mrp",
			"fieldtype": "Currency",
			"disable_total": 1,
			"width": 100,
		},
		{
			"label": _("MOP"),
			"fieldname": "mop",
			"fieldtype": "Currency",
			"disable_total": 1,
			"width": 100,
		},
		{
			"label": _("Web<br>Price"),
			"fieldname": "web_price",
			"fieldtype": "Currency",
			"disable_total": 1,
			"width": 100,
		},
		# {
		# 	"label": _("Min Selling<br>Price"),
		# 	"fieldname": "min_selling_price",
		# 	"fieldtype": "Currency",
		# 	"disable_total": 1,
		# 	"width": 100,
		# },
		# {
		# 	"label": _("Max Selling<br>Price"),
		# 	"fieldname": "max_selling_price",
		# 	"fieldtype": "Currency",
		# 	"disable_total": 1,
		# 	"width": 100,
		# },
		{
			# Data rather than the doctype's Small Text, which renders line breaks
			# and would stretch the row
			"label": _("Batch<br>Description"),
			"fieldname": "description",
			"fieldtype": "Data",
			"width": 200,
		},
		{
			"label": _("Created<br>On"),
			"fieldname": "creation",
			"fieldtype": "Datetime",
			"width": 150,
		},
		{
			"label": _("Created<br>By"),
			"fieldname": "owner",
			"fieldtype": "Link",
			"options": "User",
			"width": 150,
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
	# match one row -- it narrows nothing and multiplies nothing.
	# Newest batch first; rows with no batch record have no creation to sort by,
	# so they are put after every batch explicitly (where NULLs fall under DESC
	# differs between MariaDB and Postgres) and ordered by item among themselves.
	query = f"""
		SELECT
			stk.vendor AS vendor,
			sup.supplier_name AS vendor_name,
			it.item_group AS item_group,
			it.brand AS brand,
			it.name AS item_code,
			it.item_name AS item_name,
			stk.batch_no AS batch_no,
			NULLIF(stk.inward_qty, 0) AS inward_qty,
			stk.balance_qty AS balance_qty,
			NULLIF(ROUND(stk.balance_value, 0), 0) AS balance_value,
			stk.balance_value / NULLIF(stk.balance_qty, 0) AS valuation_rate,
			stk.balance_value / NULLIF(stk.balance_qty, 0) * (100 + COALESCE({tax_rate_select}, 0)) / 100 AS valuation_net_rate,
			bat.reference_doctype AS reference_doctype,
			bat.reference_name AS reference_name,
			bat.batch_qty AS batch_qty,
			bat.manufacturing_date AS manufacturing_date,
			bat.expiry_date AS expiry_date,
			bat.mrp AS mrp,
			bat.mop AS mop,
			bat.web_price AS web_price,
			bat.min_selling_price AS min_selling_price,
			bat.max_selling_price AS max_selling_price,
			bat.description AS description,
			bat.creation AS creation,
			bat.owner AS owner
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

		ORDER BY bat.creation IS NULL, bat.creation DESC, bat.name DESC, it.item_name, it.name
		"""

	return frappe.db.sql(query, params, as_dict=True)
