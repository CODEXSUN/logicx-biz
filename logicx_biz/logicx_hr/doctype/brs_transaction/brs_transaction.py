import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, get_link_to_form, getdate

from logicx_biz.logicx_hr.doctype.brs_date.brs_date import update_brs_transaction

# a Bank Account's BRS Transactions form a chain: the opening transaction first,
# each later one linked to the one before it through Previous / Next Transaction;
# each transaction also joins the BRS Date of its date


class BRSTransaction(Document):
	def validate(self):
		# validate runs on insert too; only a save of an existing transaction is refused
		if not self.flags.in_insert:
			frappe.throw(_("Updating a BRS Transaction is not implemented yet."))
		self.validate_amounts()
		self.validate_chain()

	def after_insert(self):
		if self.previous_transaction:
			# set_value rather than a save, which validate would refuse
			frappe.db.set_value("BRS Transaction", self.previous_transaction, "next_transaction", self.name)
		update_brs_transaction(self)
		# the date's count now includes this transaction, so a date's first transaction is roll 1
		self.db_set("daily_roll_number", frappe.db.get_value("BRS Date", self.brs_date, "no_of_transactions"))

	def on_trash(self):
		frappe.throw(_("Deleting a BRS Transaction is not implemented yet."))

	def validate_amounts(self):
		"""A transaction is either a Deposit or a Withdrawal, and its balance adds up."""
		deposit, withdrawal = flt(self.deposit), flt(self.withdrawal)
		if deposit < 0 or withdrawal < 0:
			frappe.throw(_("Deposit and Withdrawal cannot be negative."))
		if deposit and withdrawal:
			frappe.throw(_("A transaction can have a Deposit or a Withdrawal, not both."))
		# an opening transaction may have neither, so an account can open at zero
		if not self.is_opening and not deposit and not withdrawal:
			frappe.throw(_("Enter a Deposit or a Withdrawal: only the opening transaction can have neither."))

		precision = self.precision("closing_balance")
		if flt(flt(self.opening_balance) + deposit - withdrawal, precision) != flt(self.closing_balance, precision):
			frappe.throw(_("Balance is not matching."))

	def validate_chain(self):
		"""A new transaction joins its Bank Account's chain after the transaction that has no next one yet."""
		if self.next_transaction:
			frappe.throw(
				_("Leave Next Transaction empty: it is set by the BRS Transaction that follows this one.")
			)

		if self.is_opening:
			if self.previous_transaction:
				frappe.throw(
					_("An opening BRS Transaction starts the chain, so it cannot have a Previous Transaction.")
				)
			return

		if not self.previous_transaction:
			if not frappe.db.get_value("Bank Account", self.bank_account, "brs_opening_date"):
				frappe.throw(
					_("Opening balance is required. Ask your administrator to add one (even if it is zero)."),
					title=_("No Opening Balance"),
				)
			frappe.throw(_("Previous Transaction is required unless this is the opening transaction."))

		# locked until the transaction ends, so two BRS Transactions saved together
		# cannot both follow the same one
		previous = frappe.db.get_value(
			"BRS Transaction",
			self.previous_transaction,
			["bank_account", "date", "closing_balance", "next_transaction"],
			as_dict=True,
			for_update=True,
		)
		# the account first, so a wrong account's transaction is not reported as a balance or date mismatch
		if previous.bank_account != self.bank_account:
			frappe.throw(
				_("Previous Transaction belongs to another Bank Account."),
				title=_("Previous Transaction of Another Bank Account"),
			)
		if previous.next_transaction:
			frappe.throw(
				_("{0} is already followed by {1}").format(
					get_link_to_form("BRS Transaction", self.previous_transaction),
					get_link_to_form("BRS Transaction", previous.next_transaction),
				),
				title=_("Previous Transaction Already Followed"),
			)
		precision = self.precision("opening_balance")
		if flt(self.opening_balance, precision) != flt(previous.closing_balance, precision):
			frappe.throw(_("Opening Balance does not match the previous transaction's Closing Balance."))
		if getdate(self.date) < getdate(previous.date):
			frappe.throw(_("Earlier date than the last transaction is entered."))
