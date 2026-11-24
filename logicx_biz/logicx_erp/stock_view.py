"""Server side of logicx-front's Vendor Stock Explorer (/buying/vendor-stock).

The page reads its stock from the Vendor Stock and Batch Stock reports, through
Frappe's report runner. Its GRN, Purc, Sale and DC tabs list the vouchers an
item was received, bought, sold or delivered on, and `get_item_vouchers` reads
them: one row per voucher line of the item, so a voucher that lists the item on
two lines has two rows.

Through `frappe.get_list`, so a user sees only what their own permissions allow:
PermissionError when they may not read the voucher type at all, and the
vouchers their User Permissions hide are left out.
"""

import frappe
from frappe import _
from frappe.utils import escape_html

# the most rows a tab lists (logicx-front's choice). one more is read, so the
# page can tell a list cut short here from one that holds exactly this many.
ROW_LIMIT = 100

# the vouchers the page's tabs list, and what each sends of the voucher itself
# beside its name. tuples, handed to get_list as fresh lists: get_list may rework
# the list it is given in place, which on a shared one would carry into the next
# request.
VOUCHER_FIELDS = {
	# GRN: the supplier's own delivery note number (DC), as typed on the receipt
	"Purchase Receipt": ("posting_date", "supplier_delivery_note", "supplier", "supplier_name"),
	# Purc: the supplier's own invoice number and date, as typed on the invoice
	"Purchase Invoice": ("posting_date", "bill_no", "bill_date", "supplier", "supplier_name"),
	# Sale
	"Sales Invoice": ("posting_date", "customer", "customer_name"),
	# DC
	"Delivery Note": ("posting_date", "customer", "customer_name"),
}

# what each row sends of the voucher's line, as on the voucher: the quantity in
# the line's UOM, and the rate and amount before tax. each of the four vouchers
# keeps its lines in a table named `items`, of the doctype "<voucher> Item".
LINE_FIELDS = ("qty", "uom", "rate", "amount")


@frappe.whitelist()
def get_item_vouchers(voucher_type: str, item_code: str) -> dict:
	"""The submitted `voucher_type`s that list `item_code`, newest first.

	`rows` holds one row per voucher line of the item: the voucher's `name` and
	VOUCHER_FIELDS, and the line's LINE_FIELDS. Returns are included, with a
	negative qty and amount; drafts and cancelled vouchers are not. `more` says
	the rows were cut at ROW_LIMIT.
	"""
	if voucher_type not in VOUCHER_FIELDS:
		frappe.throw(_("Unknown voucher type: {0}").format(escape_html(voucher_type)))

	rows = frappe.get_list(
		voucher_type,
		# the line's fields through the voucher's `items` table, aliased so each
		# row carries them under their own names
		fields=[
			"name",
			*VOUCHER_FIELDS[voucher_type],
			*(f"items.{field} as {field}" for field in LINE_FIELDS),
		],
		# a filter on the lines' doctype joins the same table the fields read, so
		# only the item's own lines come back, not every line of its vouchers
		filters=[
			[f"{voucher_type} Item", "item_code", "=", item_code],
			["docstatus", "=", 1],
		],
		order_by="posting_date desc, posting_time desc, name desc",
		limit=ROW_LIMIT + 1,
	)
	return {"rows": rows[:ROW_LIMIT], "more": len(rows) > ROW_LIMIT}
