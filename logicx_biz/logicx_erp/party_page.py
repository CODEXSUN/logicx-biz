import frappe
from frappe import _
from frappe.utils import date_diff, nowdate

# the voucher that counts as "the party's last invoice" differs by side of the
# ledger: a Customer is billed by a Sales Invoice, a Supplier bills us with a
# Purchase Invoice
INVOICE_VOUCHER_TYPE = {
	"Customer": "Sales Invoice",
	"Supplier": "Purchase Invoice",
}

# a payment reaches the party ledger either through the Payment Entry it was
# made with, or through a Journal Entry booked directly against the party
PAYMENT_VOUCHER_TYPES = ("Payment Entry", "Journal Entry")


@frappe.whitelist()
def get_party_activity(party_type: str, party: str) -> dict:
	"""How long it has been since this party was last invoiced and last paid.

	Backs the two right-hand tiles of the Party Page. Reads `tabGL Entry`, the
	same source Party Statement reports from, so the days shown here always
	line up with the statement rendered underneath them.

	The Outstanding and Bills tiles deliberately do NOT come from here -- the
	page reads those off the Party Bill-wise Statement result it already
	fetches, which keeps that report's outstanding SQL the single source of
	truth for both the tile and the table below it.
	"""
	if party_type not in INVOICE_VOUCHER_TYPE:
		frappe.throw(_("Party Type must be Customer or Supplier."))
	if not party:
		frappe.throw(_("Party is mandatory"))

	# the page is a ledger view, so gate it on the doctype every party report
	# declares as its ref_doctype
	frappe.has_permission("GL Entry", "read", throw=True)

	# both figures are conditional aggregates over the same rows, so one scan of
	# the party's ledger answers both
	row = frappe.db.sql(
		"""
		SELECT
			MAX(CASE WHEN gle.voucher_type = %(invoice_type)s
				THEN gle.posting_date END) AS last_invoice_date,
			MAX(CASE WHEN gle.voucher_type IN %(payment_types)s
				THEN gle.posting_date END) AS last_payment_date
		FROM `tabGL Entry` gle
		WHERE gle.party = %(party)s
			AND gle.party_type = %(party_type)s
			AND gle.is_cancelled = 0
		""",
		{
			"party": party,
			"party_type": party_type,
			"invoice_type": INVOICE_VOUCHER_TYPE[party_type],
			"payment_types": PAYMENT_VOUCHER_TYPES,
		},
		as_dict=True,
	)

	last_invoice_date = row[0].last_invoice_date if row else None
	last_payment_date = row[0].last_payment_date if row else None
	today = nowdate()

	return {
		"last_invoice_date": last_invoice_date,
		"last_invoice_days": date_diff(today, last_invoice_date) if last_invoice_date else None,
		"last_payment_date": last_payment_date,
		"last_payment_days": date_diff(today, last_payment_date) if last_payment_date else None,
	}