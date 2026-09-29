"""Keep a Bank Account's BRS Opening and Closing Date in step with its BRS Dates.

Both are custom fields (see fixtures/custom_field.json). BRS Date calls
update_brs_date as each date is inserted and remove_brs_date as one is deleted;
nothing else writes them.
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


def remove_brs_date(brs_date):
	"""Take a deleted BRS Date off its Bank Account.

	Only an account's latest date is ever deleted, so the account falls back to
	the date before it -- and to no BRS Closing Date at all when that is the
	opening date, which is how an account with only its opening date stands.
	Deleting the opening date leaves the account with neither, ready for an
	opening balance to be entered again.
	"""
	# locked until the transaction ends, as when a date is added
	opening_date, closing_date = frappe.db.get_value(
		"Bank Account",
		brs_date.bank_account,
		["brs_opening_date", "brs_closing_date"],
		for_update=True,
	)

	# set_value rather than a save: Bank Account's own validations have no
	# bearing on these two fields
	if brs_date.is_opening:
		# the opening date is the account's latest only while it is its only one
		if closing_date:
			frappe.throw(
				_("{0} is the opening BRS Date of {1}, whose latest is {2}.").format(
					get_link_to_form("BRS Date", brs_date.name),
					frappe.bold(brs_date.bank_account),
					get_link_to_form("BRS Date", closing_date),
				),
				title=_("Not the Last BRS Date"),
			)
		if opening_date != brs_date.name:
			frappe.throw(
				_("{0} is not the BRS Opening Date of {1}.").format(
					get_link_to_form("BRS Date", brs_date.name), frappe.bold(brs_date.bank_account)
				),
				title=_("Chain Broken"),
			)
		frappe.db.set_value("Bank Account", brs_date.bank_account, "brs_opening_date", None)
		return

	if closing_date != brs_date.name:
		frappe.throw(
			_("{0} is not the BRS Closing Date of {1}.").format(
				get_link_to_form("BRS Date", brs_date.name), frappe.bold(brs_date.bank_account)
			),
			title=_("Chain Broken"),
		)
	# the account is left with only its opening date when the date before this one
	# is the opening one, and an opening date is never the BRS Closing Date
	previous_is_opening = brs_date.previous_brs_date and frappe.db.get_value(
		"BRS Date", brs_date.previous_brs_date, "is_opening"
	)
	frappe.db.set_value(
		"Bank Account",
		brs_date.bank_account,
		"brs_closing_date",
		None if previous_is_opening else brs_date.previous_brs_date,
	)
