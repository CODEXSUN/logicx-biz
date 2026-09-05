"""Fill in Batch.vendor -- "from whom we purchased" -- as a batch is created.

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