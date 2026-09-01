import frappe
from frappe import _

# amounts below this are rounding residue (mostly from multi-currency conversion)
# and count as settled, the way Payment Reconciliation ignores them too. Same value
# and intent as party_bill_wise_statement.py, whose grouping this mirrors.
ROUNDING_TOLERANCE = 0.01


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters), get_message(filters)


def get_columns():
	return [
		{
			"label": _("Voucher Number"),
			"fieldname": "voucher_no",
			"fieldtype": "Dynamic Link",
			"options": "voucher_type",
			"width": 180,
		},
		{
			"label": _("Date"),
			"fieldname": "voucher_date",
			"fieldtype": "Date",
			"width": 110,
		},
		{
			"label": _("Age"),
			"fieldname": "age",
			"fieldtype": "Int",
			"width": 80,
		},
		{
			"label": _("Paid Value"),
			"fieldname": "paid_value",
			"fieldtype": "Currency",
			"width": 140,
		},
		{
			"label": _("Non-Reconciled<br>Value"),
			"fieldname": "non_reconciled_value",
			"fieldtype": "Currency",
			"width": 140,
		},
	]


def get_message(filters):
	party = filters.get("party")
	if not party:
		return None
	party_type = filters.get("party_type") or "Customer"
	name_field = "supplier_name" if party_type == "Supplier" else "customer_name"
	party_name = frappe.db.get_value(party_type, party, name_field) or party
	return "<b>Name : </b> " + frappe.utils.escape_html(party_name)


def get_data(filters):
	party = filters.get("party")
	if not party:
		frappe.throw(_("Party is mandatory"))
	party_type = filters.get("party_type") or "Customer"

	# this is the payments half of Payment Reconciliation, the exact inverse of
	# Party Bill-wise Statement: the same payment-ledger grouping, opposite side kept.
	# every ledger row points at the voucher it settles (`against_voucher_no`), and a
	# voucher that settles nothing yet points at itself, so summing `amount` per
	# against-voucher gives that voucher's still-open balance. where the bill-wise
	# report lists what is left open on the bill side, this lists what is left open on
	# the payment side -- receipts, advances and credit/debit notes not yet fully
	# allocated against a bill. A fully allocated payment keeps no row pointing at
	# itself, so it drops out on its own.
	#
	# `ple.amount` is signed in its account's natural direction -- an invoice is
	# positive and a payment negative for both party types -- so it is flipped on
	# payable accounts to give a debit-positive figure (`net_debit`), exactly as in
	# party_bill_wise_statement.py.
	net_debit = (
		"CASE WHEN grp.account_type = 'Payable' THEN -grp.net_amount ELSE grp.net_amount END"
	)
	paid_debit = (
		"CASE WHEN grp.account_type = 'Payable' THEN -vch.voucher_amount ELSE vch.voucher_amount END"
	)

	# mirror of the bill-wise Outstanding column: a Customer's payment side is its
	# credit side only (receipts, advances, credit notes), a Supplier's is its debit
	# side only (payments made, debit notes). the bill side -- the invoices those
	# settle -- is excluded rather than netted against it.
	non_reconciled_value = (
		"SUM("
		f"CASE WHEN grp.party_type = 'Customer' AND {net_debit} < -%(tolerance)s THEN -{net_debit}"
		f" WHEN grp.party_type = 'Supplier' AND {net_debit} > %(tolerance)s THEN {net_debit}"
		" ELSE 0 END)"
	)
	# the voucher's gross value, shown as a positive magnitude for both party types.
	# this is the one place the mirror cannot be literal: an invoice posts its full
	# value on the single row that points at itself, so the bill-wise report reads
	# `Bill Value` straight off that row, but a payment splits its value across one
	# row per bill it was allocated to plus one for the unallocated remainder. reading
	# only the self-pointing row would report the remainder again instead of the
	# amount actually paid, so the gross is summed per *voucher* (`vch` below) rather
	# than per against-voucher. On a bill that same sum is still just its own row, so
	# the two reports agree wherever they overlap.
	paid_value = (
		"SUM("
		f"CASE WHEN grp.party_type = 'Customer' THEN -({paid_debit}) ELSE {paid_debit} END)"
	)

	data = frappe.db.sql(
		f"""
		SELECT
			grp.against_voucher_type AS voucher_type,
			grp.against_voucher_no AS voucher_no,
			MIN(vch.voucher_date) AS voucher_date,
			{paid_value} AS paid_value,
			{non_reconciled_value} AS non_reconciled_value,
			DATEDIFF(CURDATE(), MIN(vch.voucher_date)) AS age
		FROM (
			SELECT
				ple.party_type,
				ple.party,
				ple.account_type,
				ple.against_voucher_type,
				ple.against_voucher_no,
				SUM(ple.amount) AS net_amount
			FROM `tabPayment Ledger Entry` ple
			WHERE ple.delinked = 0
				AND ple.party_type = %(party_type)s
				AND ple.party = %(party)s
			GROUP BY
				ple.party_type,
				ple.party,
				ple.account_type,
				ple.against_voucher_type,
				ple.against_voucher_no
		) grp
		LEFT JOIN (
			SELECT
				ple.voucher_type,
				ple.voucher_no,
				ple.account_type,
				SUM(ple.amount) AS voucher_amount,
				MIN(ple.posting_date) AS voucher_date
			FROM `tabPayment Ledger Entry` ple
			WHERE ple.delinked = 0
				AND ple.party_type = %(party_type)s
				AND ple.party = %(party)s
			GROUP BY ple.voucher_type, ple.voucher_no, ple.account_type
		) vch
			ON vch.voucher_type = grp.against_voucher_type
			AND vch.voucher_no = grp.against_voucher_no
			AND vch.account_type = grp.account_type
		GROUP BY grp.against_voucher_type, grp.against_voucher_no
		HAVING {non_reconciled_value} != 0
		ORDER BY MIN(vch.voucher_date), grp.against_voucher_no
		""",
		{
			"party": party,
			"party_type": party_type,
			"tolerance": ROUNDING_TOLERANCE,
		},
		as_dict=True,
	)

	if data:
		data.append(
			{
				"voucher_no": _("Total"),
				"paid_value": sum(row.paid_value or 0 for row in data),
				"non_reconciled_value": sum(row.non_reconciled_value or 0 for row in data),
				"bold": 1,
			}
		)

	return data
