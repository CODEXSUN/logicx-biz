import frappe
from frappe import _

# days overdue covered by each ageing range, both bounds inclusive; a None bound is
# open-ended (used both for "46-Above" and for "0-21 days", which also covers
# not-yet-due/negative ageing). The keys double as the Select options in
# party_overdue_statement.js and as the second line of the amount column header.
AGEING_RANGES = {
	"0-30 days": (None, 30),
	"31-60 days": (31, 60),
	"61-Above": (61, None),
	"61-90 days": (61, 90),
	"91-Above": (91, None),
	"0-21 days": (None, 21),
	"22-45 days": (22, 45),
	"46-Above": (46, None),
}
DEFAULT_AGEING_RANGE = "31-60 days"

# amounts below this are rounding residue (mostly from multi-currency conversion)
# and count as settled, the way Payment Reconciliation ignores them too
ROUNDING_TOLERANCE = 0.01


def execute(filters=None):
	filters = frappe._dict(filters or {})
	ageing_range = filters.get("ageing_range") or DEFAULT_AGEING_RANGE
	if ageing_range not in AGEING_RANGES:
		frappe.throw(_("Invalid Ageing Range: {0}").format(ageing_range))

	return get_columns(ageing_range), get_data(filters, ageing_range)


def get_columns(ageing_range):
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
			"label": _("Outstanding") + f"<br>{ageing_range}",
			"fieldname": "overdue_amount",
			"fieldtype": "Currency",
			"width": 150,
		},
		{
			# no data is selected for this column -- party_overdue_statement.js's
			# formatter renders a button here for every row (using party_type/party
			# off the row itself), regardless of fieldtype/value
			"label": "",
			"fieldname": "open_statement",
			"fieldtype": "HTML",
			"width": 280,
		},
	]


def get_data(filters, ageing_range):
	# reconciliation state lives in the payment ledger, the same source the Payment
	# Reconciliation tool reads. GL Entry is not a reliable stand-in: what a voucher
	# settles is kept as ledger links, and links dropped on cancellation or on
	# re-allocation are marked `delinked` rather than removed.
	#
	# every ledger row points at the voucher it settles (`against_voucher_no`), and a
	# voucher that settles nothing yet points at itself. so summing `amount` per
	# against-voucher gives that voucher's still-open (non-reconciled) balance; a
	# fully reconciled voucher nets to zero and drops out on its own.
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

	age_from, age_to = AGEING_RANGES[ageing_range]
	age_conditions = []
	if age_from is not None:
		params["age_from"] = age_from
		age_conditions.append("DATEDIFF(CURDATE(), grp.overdue_from) >= %(age_from)s")
	if age_to is not None:
		params["age_to"] = age_to
		age_conditions.append("DATEDIFF(CURDATE(), grp.overdue_from) <= %(age_to)s")
	age_where = " AND ".join(age_conditions) if age_conditions else "1=1"

	# ageing runs from the posting date of the group's own voucher (the invoice/bill),
	# not from payments settled against it later, so a payment posted earlier cannot
	# age the invoice beyond its own date
	overdue_from = (
		"COALESCE("
		"MIN(CASE WHEN ple.voucher_no = ple.against_voucher_no"
		" AND ple.voucher_type = ple.against_voucher_type THEN ple.posting_date END),"
		" MIN(ple.posting_date))"
	)

	# ple.amount is signed in its account's natural direction -- an invoice is
	# positive and a payment negative for both party types -- so it is flipped on
	# payable accounts to give a debit-positive figure
	net_debit = "CASE WHEN grp.account_type = 'Payable' THEN -grp.net_amount ELSE grp.net_amount END"
	# a Customer's overdue balance is its debit side only (invoices), a Supplier's is
	# its credit side only (bills); the other side -- advances, credit notes,
	# unallocated payments -- is excluded rather than netted against it
	overdue_amount = (
		"SUM("
		f"CASE WHEN grp.party_type = 'Customer' AND {net_debit} > %(tolerance)s THEN {net_debit}"
		f" WHEN grp.party_type = 'Supplier' AND {net_debit} < -%(tolerance)s THEN -{net_debit}"
		" ELSE 0 END)"
	)

	return frappe.db.sql(
		f"""
		SELECT
			grp.party_type,
			grp.party,
			COALESCE(cust.customer_name, supp.supplier_name) AS party_name,
			{overdue_amount} AS overdue_amount
		FROM (
			SELECT
				ple.party_type,
				ple.party,
				ple.account_type,
				ple.against_voucher_type,
				ple.against_voucher_no,
				SUM(ple.amount) AS net_amount,
				{overdue_from} AS overdue_from
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
		WHERE {age_where}
		GROUP BY party_name, grp.party_type, grp.party
		HAVING {overdue_amount} != 0
		ORDER BY grp.party_type, grp.party
		""",
		params,
		as_dict=True,
	)
