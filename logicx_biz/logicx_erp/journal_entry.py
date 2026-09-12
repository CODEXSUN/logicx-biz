import frappe
from frappe import _
from frappe.utils import get_link_to_form

# a party opens its ledger once per company: one Party Opening Balance, one
# opening Journal Entry. the balance posts its Journal itself, but a Journal can
# also be keyed in directly -- so both sides look for the other before saving


def get_opening_journal_entry(
	company: str, party_type: str, party: str, exclude: str | None = None
) -> str | None:
	"""Name of an opening Journal Entry that already carries this party, if any.

	Drafts count too, in step with Party Opening Balance's own duplicate rule;
	only a cancelled Journal makes room for another.
	"""
	journal_entry = frappe.qb.DocType("Journal Entry")
	account_row = frappe.qb.DocType("Journal Entry Account")
	query = (
		frappe.qb.from_(account_row)
		.join(journal_entry)
		.on(account_row.parent == journal_entry.name)
		.select(journal_entry.name)
		.where(
			(journal_entry.docstatus < 2)
			& (journal_entry.is_opening == "Yes")
			& (journal_entry.company == company)
			& (account_row.party_type == party_type)
			& (account_row.party == party)
		)
		.limit(1)
	)
	if exclude:
		query = query.where(journal_entry.name != exclude)
	rows = query.run()
	return rows[0][0] if rows else None


def validate_opening_party(doc, method=None):
	"""doc_events validate hook for Journal Entry.

	An opening entry may carry a party only if no other opening entry, and no
	Party Opening Balance, already does. The balance's own Journal passes: the
	balance is still a draft while its Journal is being submitted, so it is not
	yet counted against it.
	"""
	if doc.is_opening != "Yes":
		return

	for row in doc.get("accounts"):
		if not (row.party_type and row.party):
			continue

		existing = get_opening_journal_entry(doc.company, row.party_type, row.party, exclude=doc.name)
		if existing:
			frappe.throw(
				_("Row #{0}: {1} {2} already has an opening entry in {3}: {4}").format(
					row.idx,
					row.party_type,
					frappe.bold(row.party),
					doc.company,
					get_link_to_form("Journal Entry", existing),
				),
				frappe.DuplicateEntryError,
				title=_("Duplicate Opening Entry"),
			)

		balance = frappe.db.exists(
			"Party Opening Balance",
			{
				"company": doc.company,
				"party_type": row.party_type,
				"party": row.party,
				"docstatus": 1,
			},
		)
		if balance:
			frappe.throw(
				_("Row #{0}: {1} {2} already has an opening balance in {3}: {4}").format(
					row.idx,
					row.party_type,
					frappe.bold(row.party),
					doc.company,
					get_link_to_form("Party Opening Balance", balance),
				),
				frappe.DuplicateEntryError,
				title=_("Duplicate Opening Entry"),
			)
