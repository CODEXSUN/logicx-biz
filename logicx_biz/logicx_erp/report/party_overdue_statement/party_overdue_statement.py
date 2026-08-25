import frappe
from frappe import _

# days overdue covered by each ageing range, both bounds inclusive; a None upper
# bound is open-ended. The keys double as the Select options in
# party_overdue_statement.js and as the second line of the amount column header.
AGEING_RANGES = {
	"0-21 days": (0, 21),
	"22-45 days": (22, 45),
	"46-Above": (46, None),
}
DEFAULT_AGEING_RANGE = "22-45 days"


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
	]


def get_data(filters, ageing_range):
	conditions = [
		"gle.docstatus = 1",
		"gle.is_cancelled = 0",
		"gle.party_type IN ('Customer', 'Supplier')",
		"gle.party IS NOT NULL",
		"gle.party != ''",
	]
	params = {}
	if filters.get("party_type"):
		conditions.append("gle.party_type = %(party_type)s")
		params["party_type"] = filters["party_type"]
	if filters.get("party"):
		conditions.append("gle.party = %(party)s")
		params["party"] = filters["party"]

	age_from, age_to = AGEING_RANGES[ageing_range]
	params["age_from"] = age_from
	age_conditions = ["DATEDIFF(CURDATE(), grp.overdue_from) >= %(age_from)s"]
	if age_to is not None:
		age_conditions.append("DATEDIFF(CURDATE(), grp.overdue_from) <= %(age_to)s")
		params["age_to"] = age_to

	# entries settle against each other within an `against_voucher` group; an entry
	# that references nothing (an on-account payment, an unlinked journal entry)
	# stands alone as its own group, keyed by its own voucher. a group that nets to
	# zero is settled and drops out, so what is left is the still-open amount of
	# that voucher, aged from the voucher's own posting date.
	voucher_group = "COALESCE(NULLIF(gle.against_voucher, ''), gle.voucher_no)"
	# ageing runs from the posting date of the group's own voucher (the invoice),
	# not from the payments settled against it, so a payment posted earlier cannot
	# age the invoice beyond its own date
	overdue_from = (
		"COALESCE("
		f"MIN(CASE WHEN gle.voucher_no = {voucher_group} THEN gle.posting_date END),"
		" MIN(gle.posting_date))"
	)
	# a Supplier balance sits on the credit side, so flip it so both party types
	# report a positive amount overdue in their own direction
	signed_net = "CASE WHEN grp.party_type = 'Supplier' THEN -grp.net_amount ELSE grp.net_amount END"
	overdue_amount = f"SUM({signed_net})"

	return frappe.db.sql(
		f"""
		SELECT
			grp.party_type,
			grp.party,
			COALESCE(cust.customer_name, supp.supplier_name) AS party_name,
			{overdue_amount} AS overdue_amount
		FROM (
			SELECT
				gle.party_type,
				gle.party,
				SUM(gle.debit - gle.credit) AS net_amount,
				{overdue_from} AS overdue_from
			FROM `tabGL Entry` gle
			WHERE {" AND ".join(conditions)}
			GROUP BY
				gle.party_type,
				gle.party,
				{voucher_group}
			HAVING SUM(gle.debit - gle.credit) != 0
		) grp
		LEFT JOIN `tabCustomer` cust ON cust.name = grp.party AND grp.party_type = 'Customer'
		LEFT JOIN `tabSupplier` supp ON supp.name = grp.party AND grp.party_type = 'Supplier'
		WHERE {" AND ".join(age_conditions)}
		GROUP BY party_name, grp.party_type, grp.party
		HAVING {overdue_amount} != 0
		ORDER BY grp.party_type, grp.party
		""",
		params,
		as_dict=True,
	)
