import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import formatdate, get_link_to_form


class BRSDate(Document):
	def validate(self):
		self.validate_duplicate()
		self.set_title()

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

	def set_title(self):
		"""Title reads "{Date} : {Account Name}", e.g. "24-09-2026 : HDFC Current"."""
		account_name = frappe.db.get_value("Bank Account", self.bank_account, "account_name")
		self.title = f"{formatdate(self.date)} : {account_name or self.bank_account}"


def on_doctype_update():
	# the database's own guard for one BRS Date per Bank Account and Date,
	# should two saves race past validate_duplicate
	frappe.db.add_unique("BRS Date", ["bank_account", "date"])
