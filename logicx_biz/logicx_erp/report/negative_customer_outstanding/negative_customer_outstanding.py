import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{
			"label": _("Customer"),
			"fieldname": "party",
			"fieldtype": "Link",
			"options": "Customer ID",
			"width": 100,
		},
		{
			"label": _("Customer Name"),
			"fieldname": "party_name",
			"fieldtype": "Data",
			"width": 330,
		},
		{
			"label": _("Credit Balance"),
			"fieldname": "credit_balance",
			"fieldtype": "Currency",
			"width": 150,
		},
		{
			# no data is selected for this column -- negative_customer_outstanding.js's
			# formatter renders a button here for every row (this report is always
			# Customer, so only party is needed off the row)
			"label": "",
			"fieldname": "open_statement",
			"fieldtype": "HTML",
			"width": 280,
		},
	]


def get_data(filters):
	conditions = [
		"gle.docstatus = 1",
		"gle.is_cancelled = 0",
		"gle.party_type = 'Customer'",
		"gle.party IS NOT NULL",
		"gle.party != ''",
	]
	params = {}
	if filters.get("party"):
		conditions.append("gle.party = %(party)s")
		params["party"] = filters["party"]

	return frappe.db.sql(
		f"""
		SELECT
			gle.party,
			cust.customer_name AS party_name,
			SUM(gle.credit - gle.debit) AS credit_balance
		FROM `tabGL Entry` gle
		LEFT JOIN `tabCustomer` cust ON cust.name = gle.party
		WHERE {" AND ".join(conditions)}
		GROUP BY party_name, gle.party
		HAVING SUM(gle.credit - gle.debit) > 0
		ORDER BY gle.party
		""",
		params,
		as_dict=True,
	)
