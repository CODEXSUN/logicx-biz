"""Stamp a batch from the voucher that created it, as it is created.

Two things are copied off that voucher: `vendor` -- "from whom we purchased" --
and the pricing typed on the item row (MRP, MOP, the selling price band).

`vendor` is read-only, so nothing in the UI can fill it. ERPNext creates
batches from stock transactions (erpnext.stock.serial_batch_bundle passes only
item / reference_doctype / reference_name to batch.make_batch) and never sets
Batch.supplier itself, so the purchase source has to be read off the voucher
that created the batch.

Batch.supplier is deliberately left alone: it records who *owns* the stock and
who it is returnable to, which is not always who sold it to us, and is set by
hand (see the Property Setter fixtures that make it editable).
"""

import frappe

# Vouchers that can create a batch and name the party we bought from. ERPNext
# only ever sets Batch.reference_doctype to one of the first three; Stock Entry
# carries a supplier for subcontracting transfers.
VENDOR_SOURCES = (
	"Purchase Receipt",
	"Purchase Invoice",
	"Subcontracting Receipt",
	"Stock Entry",
)


def set_vendor(doc, method=None):
	"""doc_events before_insert hook for Batch.

	Runs before insert so the value is captured once, at creation, and is not
	rewritten later if the source voucher is amended.
	"""
	if doc.get("vendor"):
		return

	voucher_supplier = get_voucher_supplier(doc.get("reference_doctype"), doc.get("reference_name"))
	# a batch entered by hand has no voucher; fall back to whatever Supplier was
	# typed on the form, which at creation time is the only party we know of
	doc.vendor = voucher_supplier or doc.get("supplier")


def get_voucher_supplier(reference_doctype: str | None, reference_name: str | None) -> str | None:
	"""Supplier named on the stock voucher that created the batch, if any."""
	if not reference_name or reference_doctype not in VENDOR_SOURCES:
		return None

	# guards against a site on a version where one of these has no supplier field
	if not frappe.get_meta(reference_doctype).has_field("supplier"):
		return None

	return frappe.db.get_value(reference_doctype, reference_name, "supplier")


# Purchase pricing carried from a voucher item row onto the batch it creates.
# Both sides use these same fieldnames, so one tuple drives the copy.
PRICING_FIELDS = ("mrp", "mop", "min_selling_price", "max_selling_price")

# Vouchers that price a batch as it arrives, and the child table holding the
# price. Stock Entry / Subcontracting Receipt rows have no purchase price to
# read, so they only ever contribute a vendor (above).
PRICING_SOURCES = {
	"Purchase Receipt": "Purchase Receipt Item",
	"Purchase Invoice": "Purchase Invoice Item",
}


def set_pricing(doc, method=None):
	"""doc_events before_insert hook for Batch.

	Runs before insert so the prices are seeded once, at creation; they stay
	editable on the batch afterwards and are never rewritten from the voucher.
	"""
	row = get_voucher_item_pricing(
		doc.get("reference_doctype"), doc.get("reference_name"), doc.get("item")
	)
	if not row:
		return

	for field in PRICING_FIELDS:
		# anything already on the batch -- a price typed by hand, or one set by
		# another hook -- is left as it is
		if not doc.get(field):
			doc.set(field, row.get(field))


def get_voucher_item_pricing(
	reference_doctype: str | None, reference_name: str | None, item_code: str | None
) -> dict | None:
	"""Pricing typed on the voucher row that brought `item_code` in, if any."""
	child_doctype = PRICING_SOURCES.get(reference_doctype)
	if not child_doctype or not reference_name or not item_code:
		return None

	# guards a site that has not migrated the custom field fixtures yet
	meta = frappe.get_meta(child_doctype)
	fields = [field for field in PRICING_FIELDS if meta.has_field(field)]
	if not fields:
		return None

	rows = frappe.db.get_values(
		child_doctype,
		{"parent": reference_name, "parenttype": reference_doctype, "item_code": item_code},
		fields,
		as_dict=True,
		order_by="idx asc",
	)

	# one voucher can list the same item on several rows, and a batch is not
	# tied to any one of them; the first row that was actually priced is the
	# best reading available
	for row in rows:
		if any(row.get(field) for field in fields):
			return row

	return None
