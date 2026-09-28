import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, formatdate, get_link_to_form, getdate

from logicx_biz.logicx_erp.bank_account import update_brs_date

# a Bank Account's BRS Dates form a chain: the opening date first, each later
# date linked to the one before it through Previous / Next BRS Date; each date
# is created by the first BRS Transaction on it (see update_brs_transaction)


class BRSDate(Document):
	def validate(self):
		# validate runs on insert too; only a save of an existing date is refused
		if not self.flags.in_insert:
			frappe.throw(_("Updating a BRS Date is not implemented yet."))
		#
		# role permissions keep users out, but not Administrator, who bypasses them
		if self.flags.in_insert and not self.flags.from_brs_transaction:
			frappe.throw(_("A BRS Date is created by the first BRS Transaction on its date, not by hand."))
		self.validate_duplicate()
		self.validate_chain()
		self.set_title()

	def after_insert(self):
		if self.previous_brs_date:
			# set_value rather than a save, which validate would refuse
			frappe.db.set_value("BRS Date", self.previous_brs_date, "next_brs_date", self.name)
		update_brs_date(self)

	def on_trash(self):
		frappe.throw(_("Deleting a BRS Date is not implemented yet."))

	def validate_duplicate(self):
		"""A Bank Account carries one BRS Date per date."""
		duplicate = frappe.db.exists(
			"BRS Date",
			{"bank_account": self.bank_account, "date": self.date, "name": ["!=", self.name]},
		)
		if duplicate:
			frappe.throw(
				_("{0} already has a BRS Date on {1}: {2}").format(
					frappe.bold(self.bank_account),
					formatdate(self.date),
					get_link_to_form("BRS Date", duplicate),
				),
				frappe.DuplicateEntryError,
				title=_("Duplicate BRS Date"),
			)

	def validate_chain(self):
		"""A new BRS Date joins its Bank Account's chain after an earlier date that has no next date yet."""
		if self.next_brs_date:
			frappe.throw(_("Leave Next BRS Date empty: it is set by the BRS Date that follows this one."))

		if self.is_opening:
			if self.previous_brs_date:
				frappe.throw(_("An opening BRS Date starts the chain, so it cannot have a Previous BRS Date."))
		elif not self.previous_brs_date:
			frappe.throw(_("Previous BRS Date is required unless this is the opening date."))

		if self.previous_brs_date:
			# locked until the transaction ends, so two BRS Dates saved together
			# cannot both follow the same date
			previous = frappe.db.get_value(
				"BRS Date",
				self.previous_brs_date,
				["bank_account", "date", "next_brs_date"],
				as_dict=True,
				for_update=True,
			)
			if previous.bank_account != self.bank_account:
				frappe.throw(
					_("Previous BRS Date {0} belongs to {1}, not {2}.").format(
						get_link_to_form("BRS Date", self.previous_brs_date),
						frappe.bold(previous.bank_account),
						frappe.bold(self.bank_account),
					),
					title=_("Previous BRS Date of Another Bank Account"),
				)
			if getdate(self.date) <= getdate(previous.date):
				frappe.throw(
					_("Date must be after the Previous BRS Date's date, {0}.").format(
						formatdate(previous.date)
					),
					title=_("Date Before Previous BRS Date"),
				)
			if previous.next_brs_date:
				frappe.throw(
					_("{0} is already followed by {1}").format(
						get_link_to_form("BRS Date", self.previous_brs_date),
						get_link_to_form("BRS Date", previous.next_brs_date),
					),
					title=_("Previous BRS Date Already Followed"),
				)

	def set_title(self):
		"""Title reads "{Date} : {Account Name}", e.g. "24-09-2026 : HDFC Current"."""
		account_name = frappe.db.get_value("Bank Account", self.bank_account, "account_name")
		self.title = f"{formatdate(self.date)} : {account_name or self.bank_account}"


def update_brs_transaction(brs_transaction):
	"""Record a new BRS Transaction on the BRS Date of its date.

	The first transaction on a date creates that date's BRS Date; each later
	one becomes the date's Closing Transaction, sets its Closing Balance, and
	adds to its count, Withdrawal and Deposit.
	"""
	if brs_transaction.is_opening:
		if frappe.db.exists("BRS Date", {"bank_account": brs_transaction.bank_account}):
			frappe.throw(_("Opening balance is already added."), title=_("Opening Balance Already Added"))
		brs_date = insert_brs_date(brs_transaction, is_opening=1)
	else:
		existing = frappe.db.get_value(
			"BRS Date",
			{"bank_account": brs_transaction.bank_account, "date": brs_transaction.date},
			["name", "no_of_transactions", "withdrawal", "deposit"],
			as_dict=True,
		)
		if existing:
			# set_value rather than a save, which validate would refuse; Withdrawal and
			# Deposit stay the sums of the date's transactions, none of which can be
			# updated or deleted yet
			frappe.db.set_value(
				"BRS Date",
				existing.name,
				{
					"closing_transaction": brs_transaction.name,
					"no_of_transactions": cint(existing.no_of_transactions) + 1,
					"withdrawal": flt(existing.withdrawal) + flt(brs_transaction.withdrawal),
					"deposit": flt(existing.deposit) + flt(brs_transaction.deposit),
					"closing_balance": brs_transaction.closing_balance,
				},
			)
			brs_date = existing.name
		else:
			opening_date, closing_date = frappe.db.get_value(
				"Bank Account", brs_transaction.bank_account, ["brs_opening_date", "brs_closing_date"]
			)
			if not opening_date:
				frappe.throw(
					_("{0} has no BRS Opening Date.").format(frappe.bold(brs_transaction.bank_account))
				)
			# the closing date is empty while the account has only its opening date
			brs_date = insert_brs_date(brs_transaction, previous_brs_date=closing_date or opening_date)

	brs_transaction.db_set("brs_date", brs_date)


def insert_brs_date(brs_transaction, **values):
	"""Insert the BRS Date that brs_transaction is the first transaction of; return its name."""
	brs_date = frappe.get_doc(
		{
			"doctype": "BRS Date",
			"bank_account": brs_transaction.bank_account,
			"date": brs_transaction.date,
			"opening_transaction": brs_transaction.name,
			"closing_transaction": brs_transaction.name,
			"no_of_transactions": 1,
			"opening_balance": brs_transaction.opening_balance,
			"withdrawal": brs_transaction.withdrawal,
			"deposit": brs_transaction.deposit,
			"closing_balance": brs_transaction.closing_balance,
			**values,
		}
	)
	# no role may create a BRS Date by hand, and validate refuses any insert without
	# this flag; a BRS Date comes only from its first transaction
	brs_date.flags.from_brs_transaction = True
	brs_date.insert(ignore_permissions=True)
	return brs_date.name


def on_doctype_update():
	# the database's own guard for one BRS Date per Bank Account and Date,
	# should two saves race past validate_duplicate
	frappe.db.add_unique("BRS Date", ["bank_account", "date"])
