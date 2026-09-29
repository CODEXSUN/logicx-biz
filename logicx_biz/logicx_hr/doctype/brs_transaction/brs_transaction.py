import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, cstr, flt, formatdate, get_link_to_form, getdate

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


# ---------------------------------------------------------------------------
# Bulk insert: append the rows of a bank statement to an account's chain.
# The API, the matching rules and a walk-through are in Bulk-Insert.MD.
# ---------------------------------------------------------------------------

# How many already-posted rows are confirmed against the chain, counting back from
# the account's last posted transaction, before anything is appended.
#
# The minimum is the guarantee: data that ends before it has been reached does not
# say enough about where it belongs, and is refused. A walk that reaches the start
# of the chain instead has confirmed every transaction the account has -- more than
# the minimum could ask for -- so a chain shorter than the minimum is not refused.
# The maximum stops a long overlap early; rows it does not reach are skipped
# unconfirmed. Keep the maximum at or above the minimum.
MIN_BACKWARD_MATCHES_LIMIT = 2
MAX_BACKWARD_MATCHES_LIMIT = 100

# What makes a statement row and a posted transaction the same transaction.
# Description is deliberately not among them: a bank rewords it, and the wording
# does not change which transaction it is.
MATCH_FIELDS = (
	("bank_account", "Bank Account"),
	("date", "Date"),
	("reference_number", "Reference Number"),
	("withdrawal", "Withdrawal"),
	("deposit", "Deposit"),
	("closing_balance", "Closing Balance"),
)

# what every row must carry; the rest of a transaction is either optional
# (Description, Reference Number, Withdrawal, Deposit) or worked out here
# (Opening Balance, Previous Transaction)
REQUIRED_FIELDS = (
	("bank_account", "Bank Account"),
	("date", "Date"),
	("closing_balance", "Closing Balance"),
)

# what a posted transaction is read as, to match it and to walk back from it
TRANSACTION_FIELDS = [
	"name",
	"bank_account",
	"date",
	"reference_number",
	"withdrawal",
	"deposit",
	"closing_balance",
	"is_opening",
	"previous_transaction",
	"next_transaction",
]


@frappe.whitelist(methods=["POST"])
def bulk_insert(data=None, **kwargs):
	"""Append the rows of a bank statement to a Bank Account's BRS Transaction chain.

	`data` is the statement in the bank's own order, oldest row first, all of it for
	one Bank Account. The rows already posted -- the statement's overlap with what is
	in the system -- are skipped, and the rows after them are inserted one by one, in
	the order given, each through a normal insert with all of BRS Transaction's own
	rules.

	Nothing is ever inserted into the middle of a chain. The rows are appended after
	the account's last posted transaction, and the data has to agree with what is
	already posted up to it; where it does not, nothing is posted at all. The whole
	call is one database transaction, so a row that fails takes with it the rows
	inserted before it.
	"""
	rows = read_rows(data)
	bank_account = cstr(rows[0]["bank_account"])

	# the inserts check this too; asked here so an unauthorised call is refused
	# before the account is read and locked
	if not frappe.has_permission("BRS Transaction", "create"):
		frappe.throw(_("Not permitted to create BRS Transactions."), frappe.PermissionError)

	precision = frappe.new_doc("BRS Transaction").precision("closing_balance")
	last_posted = get_last_posted(bank_account)
	first_new, confirmed = locate_last_posted(rows, last_posted, precision)

	inserted, previous = [], last_posted
	for index in range(first_new, len(rows)):
		previous = append_row(rows[index], index, previous)
		inserted.append(previous.name)

	return {
		"bank_account": bank_account,
		"rows": len(rows),
		"skipped": first_new,
		"confirmed": confirmed,
		"inserted": inserted,
		"last_posted_before": summarise(last_posted),
		"last_posted_after": summarise(previous),
	}


def request_data():
	"""The statement rows of a request whose "data" did not reach the method itself.

	Frappe's v2 RPC endpoint drops a "data" key from the form dict before it calls the
	method, so a body of {"data": [...]} arrives as no argument at all; it is read back
	off the request here. None when there is no request to read it from -- a call from
	a script or the console passes its rows as the argument.
	"""
	try:
		rows = frappe.form_dict.get("data")
		if rows is not None:
			return rows
		body = frappe.parse_json(frappe.request.get_data(as_text=True) or "null")
	except Exception:
		return None
	return body.get("data") if isinstance(body, dict) else body


def read_rows(data):
	"""The statement rows of a bulk insert, checked for what every row has to carry."""
	if data is None:
		data = request_data()
	if isinstance(data, str):
		data = frappe.parse_json(data)
	if isinstance(data, dict):
		# the whole body, rather than its "data", reached the method
		data = data.get("data", data)
	if not isinstance(data, list | tuple) or not data:
		frappe.throw(_('Send the statement rows as a non-empty list in "data".'), title=_("Nothing to Post"))

	for index, row in enumerate(data):
		if not isinstance(row, dict):
			frappe.throw(_("Row {0} is not an object.").format(index + 1), title=_("Nothing to Post"))
		for fieldname, label in REQUIRED_FIELDS:
			# a zero Closing Balance is a value, so only None and "" are missing
			if row.get(fieldname) in (None, ""):
				frappe.throw(
					_("Row {0} has no {1}.").format(index + 1, label), title=_("Nothing to Post")
				)
		try:
			getdate(row["date"])
		except Exception:
			frappe.throw(
				_("Row {0} has a Date that cannot be read: {1}").format(index + 1, cstr(row["date"])),
				title=_("Nothing to Post"),
			)

	# a chain is one account's, and so is the transaction the rows are appended after
	accounts = {cstr(row["bank_account"]) for row in data}
	if len(accounts) > 1:
		frappe.throw(
			_("The data is for {0} Bank Accounts ({1}). Post one Bank Account per call.").format(
				len(accounts), ", ".join(sorted(accounts))
			),
			title=_("More Than One Bank Account"),
		)
	return list(data)


def get_last_posted(bank_account):
	"""The transaction at the tail of the account's chain, the one new rows follow.

	Read through the account's latest BRS Date rather than by searching the
	transactions: the Bank Account points at that date, and the date points at its
	Closing Transaction, which is the account's latest transaction. An account with
	only its opening date has no BRS Closing Date, so that is what BRS Opening Date
	is fallen back to -- and the tail is then the opening transaction itself.
	"""
	if not frappe.db.exists("Bank Account", bank_account):
		frappe.throw(
			_("Bank Account {0} does not exist.").format(frappe.bold(bank_account)),
			title=_("No Such Bank Account"),
		)

	# locked until the request ends, so two bulk inserts on one account cannot both
	# read the same tail and both append to it
	opening_date, closing_date = frappe.db.get_value(
		"Bank Account", bank_account, ["brs_opening_date", "brs_closing_date"], for_update=True
	)
	brs_date = closing_date or opening_date
	if not brs_date:
		frappe.throw(
			_("{0} has no opening balance. Ask your administrator to add one (even if it is zero).").format(
				frappe.bold(bank_account)
			),
			title=_("No Opening Balance"),
		)

	name = frappe.db.get_value("BRS Date", brs_date, "closing_transaction")
	if not name:
		frappe.throw(
			_("BRS Date {0} has no Closing Transaction.").format(get_link_to_form("BRS Date", brs_date)),
			title=_("Chain Broken"),
		)

	transaction = frappe.db.get_value("BRS Transaction", name, TRANSACTION_FIELDS, as_dict=True)
	if transaction.next_transaction:
		# the account's latest BRS Date points at a transaction that is not the tail
		frappe.throw(
			_("{0} is already followed by {1}, so it is not the last transaction of {2}.").format(
				get_link_to_form("BRS Transaction", transaction.name),
				get_link_to_form("BRS Transaction", transaction.next_transaction),
				frappe.bold(bank_account),
			),
			title=_("Chain Broken"),
		)
	return transaction


def locate_last_posted(rows, last_posted, precision):
	"""Where the data's new rows start, and how many posted rows were confirmed.

	The last posted transaction is found in the data, and the data is then walked
	back from it alongside the chain, so that what is appended is appended at the
	end of a statement that agrees with what is already there. An opening
	transaction is matched like any other: it too has to be in the data.
	"""
	# searched from the end: everything after the last posted transaction is new, so
	# the last row that matches it is where the statement was left off
	anchor = None
	for index in range(len(rows) - 1, -1, -1):
		if not differences(rows[index], last_posted, precision):
			anchor = index
			break

	if anchor is None:
		message = _(
			"{0}, the last transaction posted for {1} ({2}, closing balance {3}), is not in the data. "
			"Send data that includes it, so that the rows following it can be appended."
		).format(
			get_link_to_form("BRS Transaction", last_posted.name),
			frappe.bold(last_posted.bank_account),
			formatdate(last_posted.date),
			flt(last_posted.closing_balance, precision),
		)
		if last_posted.is_opening:
			message += " " + _("It is the account's opening transaction, matched like any other.")
		frappe.throw(message, title=_("Last Posted Transaction Not in the Data"))

	return anchor + 1, confirm_backwards(rows, anchor, last_posted, precision)


def confirm_backwards(rows, anchor, last_posted, precision):
	"""Walk the data and the chain back from the last posted transaction, side by side.

	Both are in the same order, so each step has to land on the same transaction --
	the opening transaction, where the walk reaches it, along with the rest. The walk
	ends at the first of: the start of the chain, the start of the data, or
	MAX_BACKWARD_MATCHES_LIMIT confirmations, the last posted transaction itself being
	the first of them. Whatever it does not reach is skipped unconfirmed.
	"""
	index, transaction, confirmed = anchor, last_posted, 0
	ended_on_data = False

	while confirmed < MAX_BACKWARD_MATCHES_LIMIT:
		differing = differences(rows[index], transaction, precision)
		if differing:
			frappe.throw(
				_(
					"Row {0} does not match {1}, which is posted at that place in {2}'s chain: {3} differ. "
					"Rows are only ever appended at the end, so nothing was posted."
				).format(
					index + 1,
					get_link_to_form("BRS Transaction", transaction.name),
					frappe.bold(transaction.bank_account),
					", ".join(differing),
				),
				title=_("Data Inconsistent with the Posted Transactions"),
			)
		confirmed += 1

		# the chain is asked first: a walk that has reached the opening transaction has
		# confirmed every transaction the account has, however few that is, and the
		# minimum has nothing left to ask for
		if not transaction.previous_transaction:
			break
		index -= 1
		if index < 0:
			ended_on_data = True
			break
		transaction = frappe.db.get_value(
			"BRS Transaction", transaction.previous_transaction, TRANSACTION_FIELDS, as_dict=True
		)

	if ended_on_data and confirmed < MIN_BACKWARD_MATCHES_LIMIT:
		frappe.throw(
			_(
				"The data confirms only {0} of {1}'s posted transactions before it ends, and {2} have to "
				"be confirmed. Send data that reaches further back than {3}."
			).format(
				confirmed,
				frappe.bold(last_posted.bank_account),
				MIN_BACKWARD_MATCHES_LIMIT,
				get_link_to_form("BRS Transaction", last_posted.name),
			),
			title=_("Not Enough of the Data to Confirm"),
		)

	return confirmed


def differences(row, transaction, precision):
	"""Which of the match fields tell a statement row and a posted transaction apart.

	Empty means they are the same transaction. Amounts are compared at currency
	precision, and Reference Number trimmed, because a statement carries what the
	bank printed.
	"""
	differing = []
	for fieldname, label in MATCH_FIELDS:
		if fieldname == "bank_account":
			same = cstr(row.get(fieldname)) == cstr(transaction.bank_account)
		elif fieldname == "date":
			same = getdate(row.get(fieldname)) == getdate(transaction.date)
		elif fieldname == "reference_number":
			same = cstr(row.get(fieldname)).strip() == cstr(transaction.reference_number).strip()
		else:
			same = flt(row.get(fieldname), precision) == flt(transaction.get(fieldname), precision)
		if not same:
			differing.append(label)
	return differing


def append_row(row, index, previous):
	"""Insert one statement row after `previous`, and return the transaction inserted."""
	transaction = frappe.get_doc(
		{
			"doctype": "BRS Transaction",
			"bank_account": row["bank_account"],
			"date": row["date"],
			"description": row.get("description"),
			"reference_number": row.get("reference_number"),
			"previous_transaction": previous.name,
			# never the row's own: a transaction opens at what the one before it closed at
			"opening_balance": flt(previous.closing_balance),
			"withdrawal": flt(row.get("withdrawal")),
			"deposit": flt(row.get("deposit")),
			"closing_balance": flt(row.get("closing_balance")),
		}
	)
	try:
		transaction.insert()
	except frappe.ValidationError as exception:
		# the call is one database transaction, so the rows inserted before this one
		# are rolled back with it; say which row stopped it
		frappe.throw(
			_("Row {0} ({1}) could not be posted: {2}").format(
				index + 1, formatdate(row["date"]), cstr(exception)
			),
			title=_("Bulk Insert Stopped"),
		)
	return transaction


def summarise(transaction):
	"""A transaction as the response reports it."""
	return {
		"name": transaction.name,
		"date": cstr(transaction.date),
		"closing_balance": flt(transaction.closing_balance),
		"is_opening": cint(transaction.get("is_opening")),
	}
