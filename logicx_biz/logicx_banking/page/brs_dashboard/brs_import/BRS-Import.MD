# BRS Import

The [BRS Dashboard](../BRS-Dashboard.MD)'s **Import** tab, which posts a bank statement. One button,
**BRS Import**: pick a file, and its rows go to BRS Transaction's
[bulk insert](../../../doctype/brs_transaction/Bulk-Insert.MD), which skips the rows already posted
and appends the rest to the Bank Account's chain. What it did is then shown on the tab.

**Status: built, not yet run on a site.**

| | |
|---|---|
| **Tab** | **Import** on `/app/brs-dashboard` (`../brs_dashboard.json`; System Manager, TM Admin, TM User) |
| **Reads** | one `.json` file of statement rows, or one `.xlsx` sheet of them |
| **Posts to** | `logicx_biz.logicx_banking.doctype.brs_transaction.brs_transaction.bulk_insert` |
| **Files** | `brs_import.js` (the tab), `brs_import.py` (the .xlsx import) -- both in this folder |

## The two files it reads

**A `.json` file** holds the rows already, so the page posts them as they stand -- either the rows on
their own, `[ {...}, {...} ]`, or the whole request body the REST examples post, `{"data": [ ... ]}`.
The page only parses it, to tell a file that is not JSON from a statement the endpoint has something
to say about. Everything else about the rows is the endpoint's to judge.

**A `.xlsx` file** is imported whole on the server (`import_sheet` in `brs_import.py`). The sheet
is uploaded, read out of `frappe.request.files["file"]`, turned into those same rows and posted to
`bulk_insert` there; what comes back to the page is what `bulk_insert` answered. The workbook is
never saved and the rows never reach the browser.

## The request never carries more than the file

Three things limit how large a request body this page can send, and the desk reports all three the
same way:

| limit | where | what it is |
|---|---|---|
| `max_form_memory_size` | werkzeug 3.1 | **500 kB**, url-encoded form data only. Frappe switches it off in `app.py`, on the versions carrying the patch for it. |
| `max_content_length` | Frappe `app.py` | `max_file_size` from `site_config.json`, **in bytes**, or 25 MB |
| `client_max_body_size` | nginx, and any proxy in front of it | bench's own template sets 50m; another proxy has its own |

Every one of them comes back **413**, and the desk shows every 413 as *"File size exceeded the
maximum allowed size of 25 MB"* -- `frappe.boot.max_file_size` printed back by the handler in
`request.js`, not the limit that was reached and not a size the page necessarily came near.

So the page keeps the body small rather than guessing which limit it is under:

- **no `frappe.call`.** It posts its arguments as url-encoded form data, which is ~1.4x what it
  carries and is the only thing werkzeug's 500 kB applies to. `send()` in `brs_import.js` is the
  whole of the calling now: a JSON body, or a multipart file part.
- **the rows are not carried back and forth.** A statement's rows are several times the size of the
  workbook they were read out of -- ~227 bytes of JSON a row against a `.xlsx` that compresses --
  so converting on the server and posting from the page sends the same statement three times, the
  last two of them the largest. `import_sheet` posts them where they already are, and the only body
  that leaves the browser is the file itself.

A `.json` import still posts its rows as a JSON body, because they are the user's own rows and there
is nothing to read them out of. A `.json` file large enough to be refused is the one case left, and
the answer to it is the site's limit, not the page.

Either way what reaches `bulk_insert` is the same JSON, so the page adds no rule of its own to a
transaction: one Bank Account per file, the bank's own order, oldest row first, and far enough back
to include the account's last posted transaction. All of that, and what is skipped, confirmed and
appended, is [Bulk-Insert.MD](../../../doctype/brs_transaction/Bulk-Insert.MD).

## What a sheet has to carry

The first non-empty row is the heading row, and these are its columns -- **exactly these, no more
and no fewer**:

```
bank_account   date   description   reference_number   withdrawal   deposit   closing_balance
```

Any order. Headings are matched on their wording alone -- trimmed, case ignored, and spaces,
hyphens and underscores read as one -- so `Bank Account`, `bank account` and `BANK_ACCOUNT` are one
column.

A column the page does not know is **refused**, and so is a column missing or given twice. A column
read past in silence is a figure nobody notices is missing, and on a bank statement the figures are
the point of the file.

Below the heading row, one transaction per row:

| Cell | Read as |
|------|---------|
| `date` | A date-formatted cell is written out as `YYYY-MM-DD`. Text is passed through as it stands: whether `04-02-2026` is April or February is not the page's to guess, and `bulk_insert` refuses a date it cannot read. |
| `withdrawal`, `deposit` | Blank is zero, as `bulk_insert`'s own default is. Text that is not a number is refused, naming the row: read as a zero instead, it would come back as a balance that does not match, several rows further down. |
| `closing_balance` | The same, except that blank is left **missing** rather than zero, so `bulk_insert` reports it as the required field it is. |
| `bank_account`, `description`, `reference_number` | Text, trimmed. A Reference Number of digits arrives from a spreadsheet as a number, and a whole one is written without a decimal part -- `104513`, not `104513.0`, which would no longer match what the bank sent. |

Wholly empty rows are dropped; a spreadsheet carries them below and between its data without meaning
anything by them. Errors name the row by its own number in the sheet, so that the cell at fault can
be gone and looked at. (`bulk_insert`'s own errors count rows from the first one it was sent, which
is the sheet's first row under the heading.)

Only the workbook's first sheet is read, and the file is read up to `MAX_FILE_BYTES` (5 MB) --
beyond that it is the wrong file rather than a statement. The page holds the same ceiling as
`MAX_SHEET_BYTES`, so too large a sheet is refused by name and size before it is uploaded; the
server's check is the one that counts, on what actually arrived.

## What it shows

The file is never kept -- a `.json` is read in the browser, a `.xlsx` is read out of the request and
dropped: a statement is posted once, and the transactions are what remains, not the sheet they came
from. When the call comes back the page shows what `bulk_insert` answered --

- the Bank Account, and how many rows the file held;
- how many rows were skipped as already posted, and how many of those were confirmed against the
  chain;
- how many were posted now, each one a link to the BRS Transaction;
- the account's last posted transaction before and after -- the same one when nothing was posted.

Nothing is posted in pieces: the call is one database transaction on the server, so a row that fails
takes with it the rows inserted before it, and the panel is either the whole import or "nothing was
posted" with the reason. A file imported twice posts nothing the second time, which makes it safe to
retry a file after fixing one that was refused.

## Permissions

The page is open to System Manager, TM Admin and TM User -- the roles that can create a BRS
Transaction. `import_sheet` asks for **create** on BRS Transaction before it reads the sheet at all,
though `bulk_insert` asks again: converting a statement is of use only to someone who can post it,
and a sheet is not worth opening for someone who cannot. The inserts themselves
are a desk user's own, so a role without create gets no further than the endpoint.
