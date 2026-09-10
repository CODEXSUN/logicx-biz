"""Backfill `Batch.vendor` on batches created before the stamping hook existed.

`logicx_erp.batch.set_vendor` only runs `before_insert`, so batches already in
the site were left with an empty Vendor -- and the field is read-only, so no
one can fill them in by hand.

* Picks up only batches whose vendor is empty.
* Reads the Supplier off the voucher that created the batch
  (reference_doctype/reference_name, restricted to the shared VENDOR_SOURCES tuple imported from batch.py, so the two never drift apart).
* Falls back to the Supplier typed on the batch itself, exactly as set_vendor does for hand-entered batches.
* Writes with update_modified=False, grouped by vendor and chunked at 500 names, so a large site costs one UPDATE per distinct supplier rather than one per batch.
  Vouchers are looked up in bulk the same way.

Only empty Vendors are touched, and `modified` is left alone, so the patch is
idempotent and does not disturb the batches it fills.
"""

import frappe

from logicx_biz.logicx_erp.batch import VENDOR_SOURCES

# batches are updated in groups sharing one vendor; caps the size of the
# `name in (...)` list so a site with many batches does not build a huge query
CHUNK_SIZE = 500


def execute():
	if not frappe.db.has_column("Batch", "vendor"):
		# the field is a fixture, and fixtures are synced after post_model_sync
		# patches; a site taking this app's field and this patch in the same
		# migrate has no column to write to yet
		from frappe.utils.fixtures import sync_fixtures

		sync_fixtures("logicx_biz")
		if not frappe.db.has_column("Batch", "vendor"):
			return

	batches = frappe.get_all(
		"Batch",
		filters={"vendor": ("in", ("", None))},
		fields=["name", "reference_doctype", "reference_name", "supplier"],
	)
	if not batches:
		return

	voucher_suppliers = get_voucher_suppliers(batches)

	# grouped by the vendor being written, so each distinct supplier costs one
	# UPDATE rather than one per batch
	names_by_vendor = {}
	for batch in batches:
		vendor = (
			voucher_suppliers.get((batch.reference_doctype, batch.reference_name)) or batch.supplier
		)
		if vendor:
			names_by_vendor.setdefault(vendor, []).append(batch.name)

	for vendor, names in names_by_vendor.items():
		for chunk in chunks(names):
			frappe.db.set_value(
				"Batch", {"name": ("in", chunk)}, "vendor", vendor, update_modified=False
			)


def get_voucher_suppliers(batches) -> dict:
	"""Supplier of every voucher referenced by `batches`, keyed by (doctype, name)."""
	names_by_doctype = {}
	for batch in batches:
		if batch.reference_doctype in VENDOR_SOURCES and batch.reference_name:
			names_by_doctype.setdefault(batch.reference_doctype, set()).add(batch.reference_name)

	suppliers = {}
	for doctype, names in names_by_doctype.items():
		# the site may be on a version without this doctype, or with no
		# supplier field on it -- the same guard set_vendor applies
		if not frappe.db.table_exists(doctype) or not frappe.get_meta(doctype).has_field("supplier"):
			continue

		for chunk in chunks(sorted(names)):
			for name, supplier in frappe.get_all(
				doctype,
				filters={"name": ("in", chunk)},
				fields=["name", "supplier"],
				as_list=True,
			):
				if supplier:
					suppliers[(doctype, name)] = supplier

	return suppliers


def chunks(items):
	for start in range(0, len(items), CHUNK_SIZE):
		yield items[start : start + CHUNK_SIZE]
