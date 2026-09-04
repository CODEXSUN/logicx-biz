import frappe
from frappe import _


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
			"width": 260,
		},
		{
			# signed: positive is Dr, negative is Cr -- the Dr/Cr suffix is added by
			# party_outstanding_detailed.js's formatter, which also drops the sign,
			# so the value stays a number here and the total row still adds up
			"label": _("Opening"),
			"fieldname": "opening",
			"fieldtype": "Currency",
			"width": 140,
		},
		{
			"label": _("Debits"),
			"fieldname": "debits",
			"fieldtype": "Currency",
			"width": 140,
		},
		{
			"label": _("Credits"),
			"fieldname": "credits",
			"fieldtype": "Currency",
			"width": 140,
		},
		{
			# signed the same way as Opening, and rendered by the same formatter
			"label": _("Balance"),
			"fieldname": "balance",
			"fieldtype": "Currency",
			"width": 140,
		},
		{
			# no data is selected for this column -- party_outstanding_detailed.js's
			# formatter renders a button here for every row (using party_type/party
			# off the row itself), regardless of fieldtype/value, so nothing to add
			# in get_data()
			"label": "",
			"fieldname": "open_dashboard",
			"fieldtype": "HTML",
			"width": 110,
		},
	]


def get_data(filters):
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

	# Opening is the net of the entries flagged as opening (a Journal Entry with
	# "Is Opening Entry" = Yes carries that flag down to its GL Entries), so
	# Debits/Credits are the movement since then and
	# Balance = Opening + Debits - Credits, i.e. the same net the plain
	# "Party Outstanding" report shows.
	#
	# NULLIF() blanks the zeros, which also makes the HAVING below read as the
	# "Opening != 0 OR Debits != 0 OR Credits != 0 OR Balance != 0" it is:
	# a party is listed unless all four are zero.
	return frappe.db.sql(
		f"""
		SELECT
			gle.party_type,
			gle.party,
			COALESCE(cust.customer_name, supp.supplier_name) AS party_name,
			NULLIF(SUM(CASE WHEN gle.is_opening = 'Yes'
			                THEN gle.debit - gle.credit ELSE 0 END), 0) AS opening,
			NULLIF(SUM(CASE WHEN gle.is_opening = 'Yes'
			                THEN 0 ELSE gle.debit END), 0) AS debits,
			NULLIF(SUM(CASE WHEN gle.is_opening = 'Yes'
			                THEN 0 ELSE gle.credit END), 0) AS credits,
			NULLIF(SUM(gle.debit - gle.credit), 0) AS balance
		FROM `tabGL Entry` gle
		LEFT JOIN `tabCustomer` cust ON cust.name = gle.party AND gle.party_type = 'Customer'
		LEFT JOIN `tabSupplier` supp ON supp.name = gle.party AND gle.party_type = 'Supplier'
		WHERE {" AND ".join(conditions)}
		GROUP BY party_name, gle.party_type, gle.party
		HAVING opening IS NOT NULL
			OR debits IS NOT NULL
			OR credits IS NOT NULL
			OR balance IS NOT NULL
		ORDER BY gle.party_type, gle.party
		""",
		params,
		as_dict=True,
	)
