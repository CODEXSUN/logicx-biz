import frappe
from frappe import _

# amounts below this are rounding residue (mostly from multi-currency conversion)
# and count as settled, the way Payment Reconciliation ignores them too. Same value
# and intent as party_overdue_statement.py, whose outstanding logic this mirrors.
ROUNDING_TOLERANCE = 0.01


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters), get_message(filters)


def get_columns():
	return [
		{
			"label": _("Bill Number"),
			"fieldname": "bill_no",
			"fieldtype": "Dynamic Link",
			"options": "bill_type",
			"width": 180,
		},
		{
			"label": _("Date"),
			"fieldname": "bill_date",
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
			"label": _("Bill Value"),
			"fieldname": "bill_value",
			"fieldtype": "Currency",
			"width": 140,
		},
		{
			"label": _("Outstanding<br>Value"),
			"fieldname": "outstanding_value",
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

	# reconciliation state lives in the payment ledger, the same source the Payment
	# Reconciliation tool -- and Party Overdue Statement -- reads. Every ledger row
	# points at the voucher it settles (`against_voucher_no`); a voucher that settles
	# nothing yet points at itself. Summing `amount` per against-voucher gives that
	# voucher's still-open balance, so this report is that grouping listed one bill
	# per row instead of rolled up to a single party total.
	#
	# `ple.amount` is signed in its account's natural direction -- an invoice is
	# positive and a payment negative for both party types -- so it is flipped on
	# payable accounts to give a debit-positive figure (`net_debit`), exactly as in
	# party_overdue_statement.py.
	net_debit = (
		"CASE WHEN grp.account_type = 'Payable' THEN -grp.net_amount ELSE grp.net_amount END"
	)
	bill_debit = (
		"CASE WHEN grp.account_type = 'Payable' THEN -grp.bill_amount ELSE grp.bill_amount END"
	)

	# a Customer's outstanding is its debit side only (invoices), a Supplier's is its
	# credit side only (bills); the other side -- advances, credit notes, unallocated
	# payments -- is excluded rather than netted against it. Identical to the Party
	# Overdue Statement column, just without the Ageing Range window applied.
	outstanding_value = (
		"SUM("
		f"CASE WHEN grp.party_type = 'Customer' AND {net_debit} > %(tolerance)s THEN {net_debit}"
		f" WHEN grp.party_type = 'Supplier' AND {net_debit} < -%(tolerance)s THEN -{net_debit}"
		" ELSE 0 END)"
	)
	# the bill's gross value, shown as a positive magnitude for both party types
	bill_value = (
		"SUM("
		f"CASE WHEN grp.party_type = 'Supplier' THEN -({bill_debit}) ELSE {bill_debit} END)"
	)

	# ageing runs from the posting date of the bill's own voucher (the invoice/bill),
	# not from payments settled against it later -- same basis as the Overdue
	# Statement's `overdue_from`
	bill_date = (
		"COALESCE("
		"MIN(CASE WHEN ple.voucher_no = ple.against_voucher_no"
		" AND ple.voucher_type = ple.against_voucher_type THEN ple.posting_date END),"
		" MIN(ple.posting_date))"
	)

	data = frappe.db.sql(
		f"""
		SELECT
			grp.against_voucher_type AS bill_type,
			grp.against_voucher_no AS bill_no,
			MIN(grp.bill_date) AS bill_date,
			{bill_value} AS bill_value,
			{outstanding_value} AS outstanding_value,
			DATEDIFF(CURDATE(), MIN(grp.bill_date)) AS age
		FROM (
			SELECT
				ple.party_type,
				ple.party,
				ple.account_type,
				ple.against_voucher_type,
				ple.against_voucher_no,
				SUM(ple.amount) AS net_amount,
				SUM(CASE WHEN ple.voucher_no = ple.against_voucher_no
					AND ple.voucher_type = ple.against_voucher_type
					THEN ple.amount ELSE 0 END) AS bill_amount,
				{bill_date} AS bill_date
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
		GROUP BY grp.against_voucher_type, grp.against_voucher_no
		HAVING {outstanding_value} != 0
		ORDER BY MIN(grp.bill_date), grp.against_voucher_no
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
				"bill_no": _("Total"),
				"bill_value": sum(row.bill_value or 0 for row in data),
				"outstanding_value": sum(row.outstanding_value or 0 for row in data),
				"bold": 1,
			}
		)

	return data
