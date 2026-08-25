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

	# entries settle against each other within an `against_voucher` group; an entry
	# that references nothing (an on-account payment, an unlinked journal entry)
	# stands alone as its own group, keyed by its own voucher. a group whose debit
	# and credit do not net to zero is still awaiting reconciliation, so the whole
	# of that group's debit and credit is reported as non-reconciled.
	unsettled_debit = "SUM(CASE WHEN grp.net_amount != 0 THEN grp.debit ELSE 0 END)"
	unsettled_credit = "SUM(CASE WHEN grp.net_amount != 0 THEN grp.credit ELSE 0 END)"

	return frappe.db.sql(
		f"""
		SELECT
			grp.party_type,
			grp.party,
			COALESCE(cust.customer_name, supp.supplier_name) AS party_name,
			NULLIF({unsettled_debit}, 0) AS debit_non_reconciled,
			NULLIF({unsettled_credit}, 0) AS credit_non_reconciled,
			CASE WHEN SUM(grp.net_amount) > 0
			     THEN SUM(grp.net_amount) ELSE NULL END AS receivable_amount,
			CASE WHEN SUM(grp.net_amount) < 0
			     THEN -SUM(grp.net_amount) ELSE NULL END AS payable_amount
		FROM (
			SELECT
				gle.party_type,
				gle.party,
				SUM(gle.debit) AS debit,
				SUM(gle.credit) AS credit,
				SUM(gle.debit - gle.credit) AS net_amount
			FROM `tabGL Entry` gle
			WHERE {" AND ".join(conditions)}
			GROUP BY
				gle.party_type,
				gle.party,
				COALESCE(NULLIF(gle.against_voucher, ''), gle.voucher_no)
		) grp
		LEFT JOIN `tabCustomer` cust ON cust.name = grp.party AND grp.party_type = 'Customer'
		LEFT JOIN `tabSupplier` supp ON supp.name = grp.party AND grp.party_type = 'Supplier'
		GROUP BY party_name, grp.party_type, grp.party
		HAVING {unsettled_debit} != 0 OR {unsettled_credit} != 0
		ORDER BY grp.party_type, grp.party
		""",
		params,
		as_dict=True,
	)
