import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt


class BRSLogicX(Document):
	def validate(self):
		self.validate_amounts()
		# also True on insert, when there is no previous version to compare with
		if self.has_value_changed("bank_account") or self.has_value_changed("date"):
			self.set_day_order()

	def validate_amounts(self):
		"""A statement line is either a Withdrawal or a Deposit: exactly one of them."""
		withdrawal = flt(self.withdrawal, self.precision("withdrawal"))
		deposit = flt(self.deposit, self.precision("deposit"))
		if withdrawal and deposit:
			frappe.throw(_("Enter either a Withdrawal or a Deposit, not both."))
		if not withdrawal and not deposit:
			frappe.throw(_("Enter a Withdrawal or a Deposit."))

	def set_day_order(self):
		"""Number the statement lines 1, 2, 3... within the same Bank Account and Date."""
		rows = frappe.get_all(
			"BRS LogicX",
			# the aggregate as a dict: this frappe rejects "max(day_order)" as a string
			fields=[{"MAX": "day_order", "as": "last_day_order"}],
			filters={"bank_account": self.bank_account, "date": self.date, "name": ("!=", self.name)},
		)
		self.day_order = cint(rows[0].last_day_order if rows else 0) + 1
