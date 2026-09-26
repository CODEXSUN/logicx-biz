"""Keep a Bank Account's BRS Opening and Closing Date in step with its BRS Dates.

Both are custom fields (see fixtures/custom_field.json). BRS Date calls
update_brs_date as each date is inserted; nothing else writes them.
"""

import frappe
from frappe import _
from frappe.utils import get_link_to_form


def update_brs_date(brs_date):
	"""Record a new BRS Date on its Bank Account.

	The opening date starts the account's chain, so it is set once; any other
	date is the account's latest, its BRS Closing Date.
	"""
	# locked until the transaction ends, so two BRS Dates saved together
	# cannot both take the opening
	opening_date, closing_date = frappe.db.get_value(
		"Bank Account",
		brs_date.bank_account,
		["brs_opening_date", "brs_closing_date"],
		for_update=True,
	)

	# set_value rather than a save: Bank Account's own validations have no
	# bearing on these two fields
	if brs_date.is_opening:
		if opening_date:
			frappe.throw(
				_("{0} already has a BRS Opening Date: {1}").format(
					frappe.bold(brs_date.bank_account),
					get_link_to_form("BRS Date", opening_date),
				),
				title=_("BRS Opening Date Already Set"),
			)
		frappe.db.set_value("Bank Account", brs_date.bank_account, "brs_opening_date", brs_date.name)
	else:
		if closing_date == brs_date.name:
			return
		frappe.db.set_value("Bank Account", brs_date.bank_account, "brs_closing_date", brs_date.name)
