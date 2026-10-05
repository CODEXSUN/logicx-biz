"""Server side of the BRS Dashboard's Import tab (brs_import.js, beside this).

The tab takes the file the user picked in the browser. A .json file holds the
statement rows already and the page posts them itself, straight to BRS
Transaction's ``bulk_insert``; a .xlsx comes here, because the desk has no
spreadsheet reader of its own and openpyxl (through ``frappe.utils.xlsxutils``)
is already a Frappe dependency on the server.

A .xlsx is imported whole here rather than converted and handed back -- the sheet
is uploaded, read, and its rows posted to ``bulk_insert`` without leaving the
server. The workbook is the smallest form the statement takes: its rows are
several times its size once they are JSON, and carrying them back to the browser
only to be posted up again is what a month-long statement cannot fit through.
Whatever the limit is on a request body -- werkzeug's on form data, Frappe's own
``max_content_length``, a proxy's ``client_max_body_size`` -- the desk reports
every one of them as "File size exceeded the maximum allowed size of 25 MB",
which is ``frappe.boot``'s file limit printed back rather than the one that was
reached. Sending the file once and nothing else is what keeps clear of them.

Nothing is saved here: the sheet is read out of the request and dropped, and the
transactions are what remains of it. What a row means, how far back a statement
has to reach and which rows are skipped are all ``bulk_insert``'s
(doctype/brs_transaction/Bulk-Insert.MD).

The sheet has to carry exactly the seven columns a statement row is made of, no
more and no fewer. A column this page does not know is refused rather than
ignored: a column read past in silence is a figure nobody notices is missing,
and on a bank statement the figures are the whole point of the file.
"""

import datetime

import frappe
from frappe import _
from frappe.utils import cstr, flt
from frappe.utils.xlsxutils import read_xlsx_file_from_attached_file

from logicx_biz.logicx_hr.doctype.brs_transaction.brs_transaction import bulk_insert

# the sheet's columns, and the keys of the rows handed back to the page: exactly
# bulk_insert's statement row, in the order the page lists them
COLUMNS = (
	("bank_account", "Bank Account"),
	("date", "Date"),
	("description", "Description"),
	("reference_number", "Reference Number"),
	("withdrawal", "Withdrawal"),
	("deposit", "Deposit"),
	("closing_balance", "Closing Balance"),
)

# the columns read as figures, and what a blank cell in each of them means.
# Withdrawal and Deposit default to zero, the way bulk_insert's own do; a blank
# Closing Balance is left missing instead, so that bulk_insert reports it as the
# required field it is rather than being handed a balance of zero.
AMOUNT_DEFAULTS = {"withdrawal": 0.0, "deposit": 0.0, "closing_balance": None}

# a bank statement is a small sheet. Something this size is the wrong file rather
# than a statement, and is refused before it is opened.
MAX_FILE_BYTES = 5 * 1024 * 1024

# the title every refusal here shares: the page has posted nothing yet, and after
# one of these it does not
ERROR_TITLE = "Nothing to Import"


@frappe.whitelist()
def import_sheet():
	"""Post the .xlsx the page uploaded, and answer with what ``bulk_insert`` did.

	The whole import in one request. The workbook arrives as an upload -- one
	multipart part named "file", the way a browser sends a file and the way Frappe's
	own upload endpoint reads one -- and its rows go straight to ``bulk_insert``
	without ever leaving the server. Nothing is saved: the bytes are read out of the
	request, posted, and dropped.

	That the rows are not handed back for the page to post itself is the point of
	this endpoint. A statement's rows are several times the size of the workbook they
	were read out of, so sending them back and up again carries the same statement
	over the wire three times -- and the last two of those are a request body large
	enough to be refused, which is what a bank's own month-long statement reaches.

	It is still ``bulk_insert``'s one database transaction: a row that fails takes
	with it the rows inserted before it, and nothing is posted in pieces.
	"""
	# the inserts ask for this too; asked here so that a sheet is not read and
	# converted for someone who could not have posted it
	frappe.has_permission("BRS Transaction", "create", throw=True)

	filename, file_bytes = read_upload()
	result = bulk_insert(sheet_rows(file_bytes))
	# the file is not the endpoint's to know about, so its name is added here, for
	# the page's result panel
	result["filename"] = filename
	return result


def sheet_rows(file_bytes):
	"""The workbook's statement, as ``bulk_insert``'s rows.

	The workbook's first sheet is the statement: its first non-empty row is the
	heading row, and every row under it is one transaction.

	The rows keep the sheet's own order, which is the order ``bulk_insert`` posts
	them in -- so the sheet has to be in the bank's order, oldest row first.
	"""
	rows = read_sheet(file_bytes)
	headings = read_headings(rows[0][1])
	statement = [read_row(cells, headings, number) for number, cells in rows[1:]]
	if not statement:
		frappe.throw(_("The sheet has a heading row and nothing under it."), title=_(ERROR_TITLE))
	return statement


def read_upload():
	"""The uploaded workbook, as its name and its bytes.

	One part, named "file". A part that is not there is this being called some other
	way than from the page, but it comes back as a refusal like any other here:
	either way there is nothing to import.

	The size is checked here, on what arrived. The page checks the file it picked
	before uploading it, so that too large a sheet is said so without being sent --
	but a check made in the browser is a courtesy and not a limit.
	"""
	files = frappe.request.files if getattr(frappe, "request", None) else None
	part = files.get("file") if files else None
	if part is None:
		frappe.throw(_("No file was uploaded."), title=_(ERROR_TITLE))

	file_bytes = part.stream.read()
	if not file_bytes:
		frappe.throw(_("The uploaded file is empty."), title=_(ERROR_TITLE))

	if len(file_bytes) > MAX_FILE_BYTES:
		frappe.throw(
			_("The file is {0} MB. A bank statement is a small sheet; this page reads up to {1} MB.").format(
				flt(len(file_bytes) / 1024 / 1024, 1), int(MAX_FILE_BYTES / 1024 / 1024)
			),
			title=_(ERROR_TITLE),
		)

	return cstr(part.filename), file_bytes


def read_sheet(file_bytes):
	"""The workbook's first sheet, as its non-empty rows with their row numbers.

	The numbers are the sheet's own, so that an error names the row the user can
	go and look at. Wholly empty rows are dropped -- a spreadsheet carries them
	below and between its data without meaning anything by them -- which is why
	the numbers are kept here rather than counted again afterwards.
	"""
	try:
		sheet = read_xlsx_file_from_attached_file(fcontent=file_bytes)
	except Exception as exception:
		# a .json renamed to .xlsx, a password on the workbook, a truncated
		# download: openpyxl's own complaint says more than a flat "bad file"
		frappe.throw(
			_("This is not a .xlsx workbook that can be opened: {0}").format(cstr(exception)),
			title=_(ERROR_TITLE),
		)

	rows = [
		(number, cells)
		for number, cells in enumerate(sheet or [], start=1)
		if any(not is_blank(cell) for cell in cells)
	]
	if not rows:
		frappe.throw(_("The sheet is empty."), title=_(ERROR_TITLE))
	return rows


def read_headings(cells):
	"""The heading row, as the column index each fieldname was found at.

	Exactly COLUMNS, in any order: the bank decides what order it prints its
	statement in, so the order is not worth refusing a file over -- but a heading
	this page does not know is, and so is one it never found.

	Headings are matched on their wording alone: trimmed, case ignored, and
	spaces, hyphens and underscores all read as one, so "Bank Account",
	"bank account" and "BANK_ACCOUNT" are the same column.
	"""

	def normalise(heading):
		"""A heading as a fieldname: trimmed, lowercased, its runs of spacing as one."""
		return "_".join(cstr(heading).replace("_", " ").replace("-", " ").lower().split())

	labels = dict(COLUMNS)
	headings, unknown = {}, []

	for index, cell in enumerate(cells):
		# a spreadsheet pads its rows out to the width of its widest one
		if is_blank(cell):
			continue
		fieldname = normalise(cell)
		if fieldname not in labels:
			unknown.append(cstr(cell).strip())
		elif fieldname in headings:
			frappe.throw(
				_("The sheet has two {0} columns. Leave one column per heading.").format(labels[fieldname]),
				title=_(ERROR_TITLE),
			)
		else:
			headings[fieldname] = index

	expected = ", ".join(label for _fieldname, label in COLUMNS)
	if unknown:
		frappe.throw(
			_(
				"The sheet has {0} this page does not know: {1}. A BRS Import sheet carries exactly these "
				"columns and no others: {2}."
			).format(_("a column") if len(unknown) == 1 else _("columns"), ", ".join(unknown), expected),
			title=_(ERROR_TITLE),
		)

	missing = [label for fieldname, label in COLUMNS if fieldname not in headings]
	if missing:
		frappe.throw(
			_(
				"The sheet is missing {0}: {1}. A BRS Import sheet carries exactly these columns: {2}."
			).format(
				_("a column") if len(missing) == 1 else _("columns"), ", ".join(missing), expected
			),
			title=_(ERROR_TITLE),
		)

	return headings


def read_row(cells, headings, number):
	"""One row of the sheet, as a statement row for bulk_insert."""
	row = {}
	for fieldname, label in COLUMNS:
		index = headings[fieldname]
		# a row the user left shorter than the heading row stops before this column
		value = cells[index] if index < len(cells) else None
		if fieldname in AMOUNT_DEFAULTS:
			row[fieldname] = read_amount(value, fieldname, label, number)
		elif fieldname == "date":
			row[fieldname] = read_date(value)
		else:
			row[fieldname] = read_text(value)
	return row


def read_amount(value, fieldname, label, number):
	"""A figure of a statement row: a blank cell is the column's own default.

	Text that is not a number is refused rather than read as one. `flt()` answers
	0.0 for anything it cannot read, and a withdrawal quietly turned into a zero
	is a statement that no longer adds up -- which bulk_insert would then report
	as a balance that does not match, on some row further down.
	"""
	if is_blank(value):
		return AMOUNT_DEFAULTS[fieldname]
	if isinstance(value, int | float) and not isinstance(value, bool):
		return flt(value)
	try:
		# text is what the bank printed, so grouped the way it prints it
		return flt(float(cstr(value).strip().replace(",", "")))
	except (TypeError, ValueError):
		frappe.throw(
			_("Row {0} of the sheet has a {1} that is not a number: {2}").format(number, label, cstr(value)),
			title=_(ERROR_TITLE),
		)


def read_date(value):
	"""The Date of a statement row, as the YYYY-MM-DD bulk_insert reads.

	A cell formatted as a date arrives as a datetime, and is written out here
	leaving nothing to read into it. Text is passed through as it stands: whether
	"04-02-2026" is April or February is not this page's to guess, and bulk_insert
	refuses a date it cannot read.
	"""
	if isinstance(value, datetime.datetime | datetime.date):
		return value.strftime("%Y-%m-%d")
	return cstr(value).strip()


def read_text(value):
	"""A text column of a statement row.

	A Reference Number of digits arrives from a spreadsheet as a number, and a
	whole one written out as "104513.0" would no longer be the "104513" the bank
	sent -- bulk_insert matches Reference Number as text -- so a figure with
	nothing after the point is written without one.
	"""
	if is_blank(value):
		return ""
	if isinstance(value, bool):
		return cstr(value)
	if isinstance(value, float) and value.is_integer():
		return cstr(int(value))
	return cstr(value).strip()


def is_blank(value):
	"""An empty cell: openpyxl's None, or one holding nothing but spaces."""
	return value is None or (isinstance(value, str) and not value.strip())
