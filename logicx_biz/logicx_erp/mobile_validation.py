import re

import frappe
from frappe import _

# doctype -> field holding the mobile number
MOBILE_FIELDS = {
	"Address": "phone",
	"Contact": "mobile_no",
	"Customer": "mobile_no",
	"Supplier": "mobile_no",
}


def validate_mobile_number(value: str | None, label: str = "Mobile No") -> None:
	"""Throw unless value is empty or exactly 10 digits (no +91, spaces or dashes)."""
	value = (value or "").strip()
	if value and not re.fullmatch(r"\d{10}", value):
		frappe.throw(
			_("{0} must contain exactly 10 digits (numbers only): {1}").format(_(label), value),
			title=_("Invalid Mobile Number"),
		)


def validate_party_mobile(doc, method=None):
	"""doc_events validate hook for Address / Contact / Customer / Supplier.

	Runs after the controller's own validate, so Contact.mobile_no is already
	recomputed from its primary phone_nos row.
	"""
	fieldname = MOBILE_FIELDS.get(doc.doctype)
	if not fieldname:
		return
	validate_mobile_number(doc.get(fieldname), doc.meta.get_label(fieldname))
