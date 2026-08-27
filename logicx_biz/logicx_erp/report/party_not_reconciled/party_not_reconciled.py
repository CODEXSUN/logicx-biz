import frappe
from frappe import _

# amounts below this are rounding residue (mostly from multi-currency conversion)
# and count as settled, the way Payment Reconciliation ignores them too
ROUNDING_TOLERANCE = 0.01


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{
			"label": _("Party Type"),
			"fieldname": "party_type",
			"fieldtype": "Data",
			"width": 100,
		},
		{
			"label": _("Party ID"),
			"fieldname": "party",
			"fieldtype": "Dynamic Link",
			"options": "party_type",
			"width": 80,
		},
		{
			"label": _("Party Name"),
			"fieldname": "party_name",
			"fieldtype": "Data",
			"width": 330,
		},
		{
			"label": _("Debit<br>Non-Reconciled"),
			"fieldname": "debit_non_reconciled",
			"fieldtype": "Currency",
			"width": 150,
		},
		{
			"label": _("Credit<br>Non-Reconciled"),
			"fieldname": "credit_non_reconciled",
			"fieldtype": "Currency",
			"width": 150,
		},
		{
			"label": _("Receivable<br>Amount"),
			"fieldname": "receivable_amount",
			"fieldtype": "Currency",
			"width": 150,
		},
		{
			"label": _("Payable<br>Amount"),
			"fieldname": "payable_amount",
			"fieldtype": "Currency",
			"width": 150,
		},
	]


def get_data(filters):
	# reconciliation state lives in the payment ledger, the same source the Payment
	# Reconciliation tool reads. GL Entry is not a reliable stand-in: what a voucher
	# settles is kept as ledger links, and links dropped on cancellation or on
	# re-allocation are marked `delinked` rather than removed.
	#
	# every ledger row points at the voucher it settles (`against_voucher_no`), and a
	# voucher that settles nothing yet points at itself. so summing `amount` per
	# against-voucher gives that voucher's still-open balance, which is exactly what
	# Payment Reconciliation lists: a positive balance is an invoice awaiting payment,
	# a negative one a payment or credit note awaiting an invoice to be allocated
	# against. fully reconciled vouchers net to zero and drop out on their own.
	conditions = [
		"ple.delinked = 0",
		"ple.party_type IN ('Customer', 'Supplier')",
		"ple.party IS NOT NULL",
		"ple.party != ''",
	]
	params = {"tolerance": ROUNDING_TOLERANCE}
	if filters.get("party_type"):
		conditions.append("ple.party_type = %(party_type)s")
		params["party_type"] = filters["party_type"]
	if filters.get("party"):
		conditions.append("ple.party = %(party)s")
		params["party"] = filters["party"]

	# `ple.amount` is signed in its account's natural direction -- an invoice is
	# positive and a payment negative for both party types -- so it is flipped on
	# payable accounts to give the debit-positive figure the columns below report.
	unreconciled_debit = "SUM(CASE WHEN grp.net_debit > %(tolerance)s THEN grp.net_debit ELSE 0 END)"
	unreconciled_credit = "SUM(CASE WHEN grp.net_debit < -%(tolerance)s THEN -grp.net_debit ELSE 0 END)"
	net_unreconciled = f"({unreconciled_debit} - {unreconciled_credit})"

	return frappe.db.sql(
		f"""
		SELECT
			grp.party_type,
			grp.party,
			COALESCE(cust.customer_name, supp.supplier_name) AS party_name,
			NULLIF({unreconciled_debit}, 0) AS debit_non_reconciled,
			NULLIF({unreconciled_credit}, 0) AS credit_non_reconciled,
			CASE WHEN {net_unreconciled} > 0
			     THEN {net_unreconciled} ELSE NULL END AS receivable_amount,
			CASE WHEN {net_unreconciled} < 0
			     THEN -{net_unreconciled} ELSE NULL END AS payable_amount
		FROM (
			SELECT
				ple.party_type,
				ple.party,
				CASE WHEN ple.account_type = 'Payable'
				     THEN -SUM(ple.amount) ELSE SUM(ple.amount) END AS net_debit
			FROM `tabPayment Ledger Entry` ple
			WHERE {" AND ".join(conditions)}
			GROUP BY
				ple.party_type,
				ple.party,
				ple.account_type,
				ple.against_voucher_type,
				ple.against_voucher_no
		) grp
		LEFT JOIN `tabCustomer` cust ON cust.name = grp.party AND grp.party_type = 'Customer'
		LEFT JOIN `tabSupplier` supp ON supp.name = grp.party AND grp.party_type = 'Supplier'
		GROUP BY party_name, grp.party_type, grp.party
		HAVING {unreconciled_debit} != 0 AND {unreconciled_credit} != 0
		ORDER BY grp.party_type, grp.party
		""",
		params,
		as_dict=True,
	)
