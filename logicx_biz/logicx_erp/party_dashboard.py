import frappe
from frappe import _
from frappe.utils import date_diff, flt, nowdate

# the voucher that counts as "the party's last invoice" differs by side of the
# ledger: a Customer is billed by a Sales Invoice, a Supplier bills us with a
# Purchase Invoice
INVOICE_VOUCHER_TYPE = {
	"Customer": "Sales Invoice",
	"Supplier": "Purchase Invoice",
}

# a payment reaches the party ledger through the Payment Entry it was made with,
# or through a Journal Entry booked directly against the party
PAYMENT_VOUCHER_TYPES = ("Payment Entry", "Journal Entry")

# ...or on the invoice itself: a POS invoice collects its money at the counter,
# so the party is settled by the invoice's own voucher and no Payment Entry is
# ever written. a paid Purchase Invoice is the supplier-side twin of that. these
# flags mark the invoices that carry their own payment.
SELF_PAID_FLAG = {
	"Sales Invoice": "is_pos",
	"Purchase Invoice": "is_paid",
}

# which column of the ledger each figure is in. a party's own balance sits on one
# side -- a Customer owes us (debit), we owe a Supplier (credit) -- so an invoice
# lands on that side and whatever settles it lands opposite.
INVOICE_SIDE = {"Customer": "debit", "Supplier": "credit"}
PAYMENT_SIDE = {"Customer": "credit", "Supplier": "debit"}


@frappe.whitelist()
def get_party_activity(party_type: str, party: str) -> dict:
	"""The party's last invoice and last payment: when, how much, and which voucher.

	Backs the two right-hand tiles of the Party Dashboard. Reads `tabGL Entry`, the
	same source Party Statement reports from, so the figures shown here always
	line up with the statement rendered underneath them.

	The voucher type and number come back too, so a click on either tile can open
	the document the tile is describing.

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

	activity = {}
	activity.update(_as_tile("last_invoice", _last_invoice(party_type, party)))
	activity.update(_as_tile("last_payment", _last_payment(party_type, party)))
	return activity


def _last_invoice(party_type: str, party: str) -> dict | None:
	"""The party's most recent invoice, and what it was billed.

	The amount is the invoice's own value rather than what is still owed on it:
	the party is charged the full total on one side of the ledger, and everything
	that settles the invoice -- a POS payment taken at the counter, an advance
	adjusted against it -- is written on the other side, which this figure leaves
	out.
	"""
	return _last_voucher(
		party_type,
		party,
		(INVOICE_VOUCHER_TYPE[party_type],),
		INVOICE_SIDE[party_type],
	)


def _last_payment(party_type: str, party: str) -> dict | None:
	"""The party's most recent payment, whichever voucher carried it.

	Invoices are searched alongside the payment vouchers, because a POS invoice
	settles itself (see SELF_PAID_FLAG). Only invoices flagged as self-paid count,
	which keeps a credit note -- written on the same side of the ledger a payment
	is -- from passing itself off as money received.
	"""
	invoice_type = INVOICE_VOUCHER_TYPE[party_type]
	self_paid_only = """
			AND (gle.voucher_type != %(invoice_type)s OR EXISTS (
				SELECT 1 FROM `tab{invoice_type}` inv
				WHERE inv.name = gle.voucher_no AND inv.{flag} = 1
			))""".format(invoice_type=invoice_type, flag=SELF_PAID_FLAG[invoice_type])

	return _last_voucher(
		party_type,
		party,
		(*PAYMENT_VOUCHER_TYPES, invoice_type),
		PAYMENT_SIDE[party_type],
		condition=self_paid_only,
	)


def _last_voucher(
	party_type: str,
	party: str,
	voucher_types: tuple,
	side: str,
	condition: str = "",
) -> dict | None:
	"""The party's most recent voucher of these types, and what it moved on `side`.

	Grouped per voucher, so one that touches the party on more than one row -- a
	POS invoice, an invoice adjusting an advance, a journal with two party lines --
	reports a single figure. Summing one side only is what lets the two tiles read
	the same voucher differently: a POS invoice is its full value to one of them
	and the amount collected to the other.

	A voucher that moves nothing on that side is passed over rather than reported
	as a zero, so a credit note is never mistaken for the last invoice.

	Ordered by creation within a posting date, so same-day vouchers resolve to the
	one entered last rather than to whichever the database happened to return.

	`side` and `condition` are built from the constants above, never from the
	caller's arguments -- the query interpolates those two and binds everything
	else.
	"""
	rows = frappe.db.sql(
		f"""
		SELECT
			gle.voucher_type,
			gle.voucher_no,
			gle.posting_date,
			SUM(gle.{side}) AS amount
		FROM `tabGL Entry` gle
		WHERE gle.party = %(party)s
			AND gle.party_type = %(party_type)s
			AND gle.is_cancelled = 0
			AND gle.voucher_type IN %(voucher_types)s{condition}
		GROUP BY gle.voucher_type, gle.voucher_no, gle.posting_date
		HAVING amount > 0
		ORDER BY gle.posting_date DESC, MAX(gle.creation) DESC
		LIMIT 1
		""",
		{
			"party": party,
			"party_type": party_type,
			"voucher_types": voucher_types,
			"invoice_type": INVOICE_VOUCHER_TYPE[party_type],
		},
		as_dict=True,
	)

	return rows[0] if rows else None


def _as_tile(prefix: str, voucher: dict | None) -> dict:
	"""Flatten one voucher into the `<prefix>_*` keys its tile reads.

	Every key is present whether or not a voucher was found, so the page can tell
	"nothing here" apart from a field it forgot to ask for.
	"""
	if not voucher:
		return dict.fromkeys(
			(
				f"{prefix}_date",
				f"{prefix}_days",
				f"{prefix}_amount",
				f"{prefix}_voucher_type",
				f"{prefix}_voucher_no",
			)
		)

	return {
		f"{prefix}_date": voucher.posting_date,
		f"{prefix}_days": date_diff(nowdate(), voucher.posting_date),
		f"{prefix}_amount": flt(voucher.amount),
		f"{prefix}_voucher_type": voucher.voucher_type,
		f"{prefix}_voucher_no": voucher.voucher_no,
	}
