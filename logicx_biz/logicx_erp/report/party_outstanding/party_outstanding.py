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

	return frappe.db.sql(
		f"""
		SELECT
			gle.party_type,
			gle.party,
			COALESCE(cust.customer_name, supp.supplier_name) AS party_name,
			CASE WHEN SUM(gle.debit - gle.credit) > 0
			     THEN SUM(gle.debit - gle.credit) ELSE NULL END AS receivable_amount,
			CASE WHEN SUM(gle.credit - gle.debit) > 0
			     THEN SUM(gle.credit - gle.debit) ELSE NULL END AS payable_amount
		FROM `tabGL Entry` gle
		LEFT JOIN `tabCustomer` cust ON cust.name = gle.party AND gle.party_type = 'Customer'
		LEFT JOIN `tabSupplier` supp ON supp.name = gle.party AND gle.party_type = 'Supplier'
		WHERE {" AND ".join(conditions)}
		GROUP BY party_name, gle.party_type, gle.party
		HAVING SUM(gle.debit - gle.credit) != 0
		ORDER BY gle.party_type, gle.party
		""",
		params,
		as_dict=True,
	)
