import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{
			"label": _("Supplier"),
			"fieldname": "party",
			"fieldtype": "Link",
			"options": "Supplier ID",
			"width": 100,
		},
		{
			"label": _("Supplier Name"),
			"fieldname": "party_name",
			"fieldtype": "Data",
			"width": 330,
		},
		{
			"label": _("Debit Balance"),
			"fieldname": "debit_balance",
			"fieldtype": "Currency",
			"width": 150,
		},
		{
			# no data is selected for this column -- negative_supplier_outstanding.js's
			# formatter renders a button here for every row (this report is always
			# Supplier, so only party is needed off the row)
			"label": "",
			"fieldname": "open_statement",
			"fieldtype": "HTML",
			"width": 190,
		},
	]


def get_data(filters):
	conditions = [
		"gle.docstatus = 1",
		"gle.is_cancelled = 0",
		"gle.party_type = 'Supplier'",
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
			supp.supplier_name AS party_name,
			SUM(gle.debit - gle.credit) AS debit_balance
		FROM `tabGL Entry` gle
		LEFT JOIN `tabSupplier` supp ON supp.name = gle.party
		WHERE {" AND ".join(conditions)}
		GROUP BY party_name, gle.party
		HAVING SUM(gle.debit - gle.credit) > 0
		ORDER BY gle.party
		""",
		params,
		as_dict=True,
	)
