import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import formatdate, get_link_to_form, getdate

from logicx_biz.logicx_erp.bank_account import update_brs_date

# a Bank Account's BRS Dates form a chain: the opening date first, each later
# date linked to the one before it through Previous / Next BRS Date


class BRSDate(Document):
	def validate(self):
		# validate runs on insert too; only a save of an existing date is refused
		if not self.flags.in_insert:
			frappe.throw(_("Updating a BRS Date is not implemented yet."))
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


def on_doctype_update():
	# the database's own guard for one BRS Date per Bank Account and Date,
	# should two saves race past validate_duplicate
	frappe.db.add_unique("BRS Date", ["bank_account", "date"])
