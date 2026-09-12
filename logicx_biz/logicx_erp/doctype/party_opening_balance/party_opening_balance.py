import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, get_link_to_form, nowdate

from logicx_biz.logicx_erp.journal_entry import get_opening_journal_entry

# an opening balance is only meaningful for a party that runs a ledger with us:
# a Customer who owes us, or a Supplier we owe. the form's party_type picker is
# filtered to these two, and validate holds the same line for imports and the API
PARTY_TYPES = ("Customer", "Supplier")


class PartyOpeningBalance(Document):
	def before_validate(self):
		# both stamps are read-only on the form, so they are filled here rather
		# than by the user -- and filled again for rows coming in through import
		# or the API, where the client-side defaults never run
		if not self.company:
			self.company = get_default_company()
		if not self.posting_date:
			self.posting_date = get_fiscal_year_start_date(self.company)

	def validate(self):
		self.validate_party_type()
		self.party_name = _party_name(self.party_type, self.party)
		self.validate_amount()
		self.validate_duplicate()
		self.validate_opening_journal_entry()

	def after_insert(self):
		# there is no draft stage: the balance is on the books the moment it is
		# entered. done here, on the server, so the form, quick entry, import and
		# the API all behave the same. the row is already in the table by now, so
		# submit() takes the normal update path (validate, before_submit, on_submit)
		# with the submit permission checked like any other submit
		self.submit()

	def before_submit(self):
		# runs ahead of the row being written, so the link lands in the same save
		self.journal_entry = self.make_journal_entry().name

	def on_cancel(self):
		# after our own row is marked cancelled: the Journal refuses to cancel
		# while a submitted document still links to it, and until this point
		# that document is us
		self.cancel_journal_entry()

	def validate_party_type(self):
		if self.party_type not in PARTY_TYPES:
			frappe.throw(_("Party Type must be Customer or Supplier."))

	def validate_amount(self):
		"""An opening balance sits on one side of the party ledger, and is never nil."""
		if flt(self.debit) and flt(self.credit):
			frappe.throw(_("Enter the opening balance as either Debit or Credit, not both."))
		if not flt(self.debit) and not flt(self.credit):
			frappe.throw(_("Enter an opening balance in either Debit or Credit."))

	def validate_duplicate(self):
		"""A party opens its ledger once per company, so only one entry may carry that balance.

		Cancelled entries are left out: cancelling one is how you make room for a
		replacement, and an amended entry points back at a cancelled original.
		"""
		if not (self.company and self.party_type and self.party):
			return

		duplicate = frappe.db.exists(
			"Party Opening Balance",
			{
				"company": self.company,
				"party_type": self.party_type,
				"party": self.party,
				"docstatus": ["<", 2],
				"name": ["!=", self.name],
			},
		)
		if duplicate:
			frappe.throw(
				_("{0} already carries an opening balance for {1} in {2}: {3}").format(
					self.party_type,
					frappe.bold(self.party_name or self.party),
					self.company,
					get_link_to_form("Party Opening Balance", duplicate),
				),
				frappe.DuplicateEntryError,
				title=_("Duplicate Opening Balance"),
			)

	def validate_opening_journal_entry(self):
		"""The one opening Journal a party may carry must be this entry's own.

		Someone may have keyed an opening entry straight into Journal Entry;
		this balance would then book the party a second time.
		"""
		if not (self.company and self.party_type and self.party):
			return

		existing = get_opening_journal_entry(
			self.company, self.party_type, self.party, exclude=self.journal_entry
		)
		if existing:
			frappe.throw(
				_("{0} {1} already has an opening Journal Entry in {2}: {3}").format(
					self.party_type,
					frappe.bold(self.party_name or self.party),
					self.company,
					get_link_to_form("Journal Entry", existing),
				),
				frappe.DuplicateEntryError,
				title=_("Duplicate Opening Balance"),
			)

	def make_journal_entry(self):
		"""Book the balance in the party's ledger, against the Temporary Opening account.

		A Customer's balance goes to the receivable (Debtors) account and a
		Supplier's to the payable (Creditors) account -- whichever the party or
		the company is set up with. The second line mirrors it on Temporary
		Opening, so the Journal balances and the figure reaches the General
		Ledger and the party's outstanding from the fiscal year's first day.
		"""
		from erpnext.accounts.doctype.opening_invoice_creation_tool.opening_invoice_creation_tool import (
			get_temporary_opening_account,
		)
		from erpnext.accounts.party import get_party_account

		debit, credit = flt(self.debit), flt(self.credit)
		journal_entry = frappe.get_doc(
			{
				"doctype": "Journal Entry",
				"voucher_type": "Opening Entry",
				"is_opening": "Yes",
				"company": self.company,
				"posting_date": self.posting_date,
				"user_remark": _("Opening balance of {0} {1} ({2})").format(
					self.party_type, self.party_name or self.party, self.name
				),
				"accounts": [
					{
						"account": get_party_account(self.party_type, self.party, self.company),
						"party_type": self.party_type,
						"party": self.party,
						"debit_in_account_currency": debit,
						"credit_in_account_currency": credit,
					},
					{
						"account": get_temporary_opening_account(self.company),
						"debit_in_account_currency": credit,
						"credit_in_account_currency": debit,
					},
				],
			}
		)
		# the right to submit an opening balance is the right to post its Journal:
		# TM Accounts need not hold Journal Entry permissions of their own
		journal_entry.flags.ignore_permissions = True
		journal_entry.submit()
		return journal_entry

	def cancel_journal_entry(self):
		if not self.journal_entry:
			return
		journal_entry = frappe.get_doc("Journal Entry", self.journal_entry)
		if journal_entry.docstatus != 1:
			return
		journal_entry.flags.ignore_permissions = True
		journal_entry.cancel()


def get_default_company() -> str | None:
	return frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)


def get_fiscal_year_start_date(company: str | None = None) -> str | None:
	"""Start of the fiscal year today falls in -- the date an opening balance is stamped with."""
	try:
		from erpnext.accounts.utils import get_fiscal_year

		return get_fiscal_year(nowdate(), company=company, as_dict=True).get("year_start_date")
	except Exception:
		# no Fiscal Year covers today for this company: fall back to whichever
		# year the user is working in
		fiscal_year = frappe.defaults.get_user_default("fiscal_year")
		return frappe.db.get_value("Fiscal Year", fiscal_year, "year_start_date") if fiscal_year else None


def _party_name(party_type: str, party: str) -> str | None:
	"""The party's display name, read off whichever field its doctype titles records with."""
	if not (party_type and party):
		return None
	title_field = frappe.get_meta(party_type).get_title_field()
	return frappe.db.get_value(party_type, party, title_field)


@frappe.whitelist()
def get_opening_defaults(company: str | None = None) -> dict:
	"""Company and posting date for a fresh entry, so the form opens with both filled in."""
	company = company or get_default_company()
	return {"company": company, "posting_date": get_fiscal_year_start_date(company)}


@frappe.whitelist()
def get_party_name(party_type: str, party: str) -> str | None:
	if party_type not in PARTY_TYPES:
		frappe.throw(_("Party Type must be Customer or Supplier."))
	frappe.has_permission(party_type, "read", doc=party, throw=True)
	return _party_name(party_type, party)
