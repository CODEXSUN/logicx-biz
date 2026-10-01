# BRS Transaction: Bulk Insert

Post a bank statement in one call. The rows already in the system are skipped, and the rows after
them are appended to the Bank Account's BRS Transaction chain, one by one, in the order given.

Nothing is ever inserted into the middle of a chain. A statement that disagrees with what is
already posted is refused whole, and nothing is written.

**Status: built, not yet run on a site.**

| | |
|---|---|
| **Endpoint** | `POST /api/v2/method/logicx_biz.logicx_hr.doctype.brs_transaction.brs_transaction.bulk_insert` |
| | `POST /api/method/...` also works; v1 wraps the result in `message`, v2 in `data`. |
| **Auth** | Token or session, like any whitelisted method. Needs **create** on BRS Transaction (`TM User`, `TM Admin`). |
| **Code** | `bulk_insert()` in [brs_transaction.py](brs_transaction.py) |
| **Examples** | [Frappe.Api.BrsTransaction.rest](Frappe.Api.BrsTransaction.rest) |

The chain itself, and the rules every insert goes through, are in [Design.MD](Design.MD). This
endpoint adds no rules of its own to a transaction: each row is inserted as a normal BRS
Transaction and gets all of them.

## Request

```json
{
  "data": [
    {
      "bank_account": "HDFC Bank 4980 - HDFC",
      "date": "2026-09-01",
      "description": "NEFT from customer 1",
      "reference_number": "N091260401234567",
      "withdrawal": 1000.0,
      "deposit": 0.0,
      "closing_balance": 17000.0
    },
    {
      "bank_account": "HDFC Bank 4980 - HDFC",
      "date": "2026-09-01",
      "description": "NEFT from customer 2",
      "reference_number": "N091260401234999",
      "withdrawal": 0.0,
      "deposit": 3000.0,
      "closing_balance": 20000.0
    },
    {
      "bank_account": "HDFC Bank 4980 - HDFC",
      "date": "2026-09-02",
      "description": "NEFT from customer 3",
      "reference_number": "N091260401234999",
      "withdrawal": 0.0,
      "deposit": 2000.0,
      "closing_balance": 22000.0
    }
  ]
}
```

`data` is the statement **in the bank's own order, oldest row first**. Order is the whole meaning
of the request: it is the order the rows are matched in and the order they are posted in.

| Field | Required | Notes |
|-------|----------|-------|
| `bank_account` | yes | The same account on every row. Two accounts in one call is an error -- send one call per account. |
| `date` | yes | `YYYY-MM-DD`. |
| `closing_balance` | yes | The bank's running balance after the row. `0` is a value, not a missing one. |
| `withdrawal` | no, defaults to 0 | One of Withdrawal and Deposit is zero. |
| `deposit` | no, defaults to 0 | |
| `reference_number` | no | Matched trimmed of surrounding spaces. |
| `description` | no | Stored, never matched on. |

**How far back the data has to reach.** The data always has to include the account's last posted
transaction, and normally the one or more transactions behind it as well -- see
[the minimum](#constants). The three rows above are a request that posts one row: it works on an
account whose last posted transaction is the second of them.

`opening_balance` is **not** taken from the data. Each posted row opens at the Closing Balance of
the transaction before it, so the statement's own running balance is what proves the rows join up:
a row whose Closing Balance does not equal that opening plus Deposit minus Withdrawal is refused
with BRS Transaction's own "Balance is not matching." That is what catches a statement with rows
missing from the middle of it.

`is_opening` is not accepted either. An account's opening transaction is entered by hand by a
TM Admin, and an account without one is refused. Once entered it is matched like any other
transaction, so the row that stands for it has to be in the data while the data still reaches that
far back.

## Response

The first call of the walk-through below -- the opening row and the three rows above:

```json
{
  "bank_account": "HDFC Bank 4980 - HDFC",
  "rows": 4,
  "skipped": 1,
  "confirmed": 1,
  "inserted": ["BRSTXN2", "BRSTXN3", "BRSTXN4"],
  "last_posted_before": {"name": "BRSTXN1", "date": "2026-08-31", "closing_balance": 18000.0, "is_opening": 1},
  "last_posted_after":  {"name": "BRSTXN4", "date": "2026-09-02", "closing_balance": 22000.0, "is_opening": 0}
}
```

| Field | What |
|-------|------|
| `rows` | Rows in the request. |
| `skipped` | Rows at and before the place the statement was left off: already posted, or older than the account's opening transaction. |
| `confirmed` | How many of those skipped rows were checked against the chain, counting back from the last posted transaction. Between the two limits below, or fewer when the walk reached the start of the chain. |
| `inserted` | The BRS Transactions created, in the order they were created. Empty when the whole statement was already posted. |
| `last_posted_before` / `last_posted_after` | The tail of the account's chain before and after the call. The same when nothing was inserted. |

## What counts as the same transaction

A statement row and a posted BRS Transaction are the same transaction when **all** of these agree:

| | Compared |
|---|---|
| Bank Account | exactly |
| Date | as dates |
| Reference Number | trimmed of surrounding spaces; empty matches empty |
| Withdrawal | at currency precision |
| Deposit | at currency precision |
| Closing Balance | at currency precision |

**Description is deliberately not among them.** A bank rewords its own narration between
downloads, and the wording does not change which transaction it is.

Amounts are compared with `flt(value, precision)` on both sides, at the Closing Balance field's
currency precision, so a statement that prints `1000.0` and a stored `1000.00` are the same
figure.

**The opening transaction takes part in matching like any other.** Whatever it was entered with is
what a row has to agree with -- its date, its amounts, its Closing Balance, and its Reference
Number, which is usually empty and so matches a row that carries none.

## How it works

```
Bank Account "HDFC Bank 4980 - HDFC"
      brs_closing_date -> BRS Date -> closing_transaction = BRSTXN4   <-- the last posted transaction
                                                                          (the opening one, if that is all there is)

  chain    BRSTXN1  <-  BRSTXN2  <-  BRSTXN3  <-  BRSTXN4
          (opening)         |            |            |
               |            |            |            |   confirmed backwards: at least MIN,
               |            |            |            |   at most MAX, the opening among them
               v            v            v            v
  data  [  row 1  ][  row 2  ][  row 3  ][  row 4  ][  row 5  ][  row 6  ]
                                                          ^
                                                          +-- appended from here, in order
```

1. **Find the last posted transaction.** The Bank Account's `brs_closing_date`, or its
   `brs_opening_date` while the account has only its opening date, points at a BRS Date; that
   date's Closing Transaction is the account's latest transaction. The account row is read
   `for_update`, so two bulk inserts on one account cannot both append to the same tail.
2. **Find it in the data**, searching from the end: everything after the last posted transaction
   is new, so the last row that matches it is where the statement was left off. Data that does not
   contain it is refused -- there is no point to append from. This holds when the last posted
   transaction is the opening one.
3. **Walk both back from there, side by side.** The data and the chain are in the same order, so
   each step has to land on the same transaction. A step that does not is an inconsistency, and
   nothing is posted. The walk ends at the first of: the start of the chain, the start of the
   data, or `MAX_BACKWARD_MATCHES_LIMIT` confirmations. Ending on the data has to have reached
   `MIN_BACKWARD_MATCHES_LIMIT` confirmations, or the data says too little about where it belongs
   and is refused.
4. **Append the rest forward,** one insert per row, in the order given. Each row is inserted as a
   normal BRS Transaction: `previous_transaction` is the row before it (the last posted
   transaction, for the first one), `opening_balance` is that transaction's Closing Balance, and
   BRS Transaction's own rules do the rest -- balance, date order, the chain links, the BRS Date
   and the Daily Roll Number.

### Constants

At the top of the bulk insert section in [brs_transaction.py](brs_transaction.py).

| Constant | Value | What |
|----------|-------|------|
| `MIN_BACKWARD_MATCHES_LIMIT` | 2 | The guarantee. Data that ends before this many transactions have been confirmed is refused. **A walk that reaches the start of the chain is not refused, however few it confirmed:** it has confirmed every transaction the account has, which is more than the minimum could ask for. That is what lets a brand-new account, whose chain is its opening transaction alone, take its first statement. |
| `MAX_BACKWARD_MATCHES_LIMIT` | 3 | The stop. Confirming stops here however much of the overlap is left; the rest is skipped unconfirmed. Raise it to confirm more, lower it for a shorter check. Keep it at or above the minimum. |
| `MATCH_FIELDS` | 6 fields | What makes a row and a transaction the same transaction (above). |

### Walk-through

The account's only transaction is the one a TM Admin entered by hand: **BRSTXN1**, opening,
31-08-2026, deposit 18,000, closing 18,000, no reference number.

**First call** -- the row that stands for that opening transaction, then the three rows of the
request above.

| Step | |
|------|---|
| Last posted | BRSTXN1, the opening transaction. |
| In the data | Row 1: same date, same amounts, same closing balance, and neither carries a reference number. |
| Confirmed backwards | Row 1 = BRSTXN1, and the chain ends there. 1 confirmation, and the minimum does not apply: the whole chain was confirmed. |
| Appended | Row 2 opens at 18,000, withdraws 1,000, closes at 17,000 -> **BRSTXN2**. Row 3 opens at 17,000 -> **BRSTXN3**. Row 4 opens at 20,000 -> **BRSTXN4**. |
| Result | `skipped` 1, `confirmed` 1, `inserted` `["BRSTXN2", "BRSTXN3", "BRSTXN4"]`. |

Rows 2 and 3 are both on 01-09-2026, so they share one BRS Date and take Daily Roll Numbers 1 and
2; row 4 starts a new BRS Date on 02-09-2026 at roll 1.

**Second call** -- next week's download: the three rows again, and a fourth (03-09-2026, cheque
104512, withdrawal 2,500, closing 19,500). The opening row is no longer in it, and no longer needs
to be.

| Step | |
|------|---|
| Last posted | BRSTXN4 (02-09-2026, deposit 2,000, closing 22,000). |
| In the data | Row 3, which agrees on all six match fields. |
| Confirmed backwards | Row 3 = BRSTXN4, row 2 = BRSTXN3, row 1 = BRSTXN2, then the data ends. 3 confirmations, and 3 is at least the minimum of 2. |
| Appended | Row 4 opens at 22,000, withdraws 2,500, closes at 19,500 -> **BRSTXN5**. |
| Result | `skipped` 3, `confirmed` 3, `inserted` `["BRSTXN5"]`. |

**A call that is refused** -- the same fourth row, but sent with only the one row before it
(02-09-2026) for company. The last posted transaction is found at row 1, confirmed, and then the
data ends with 1 confirmation against a chain that has more behind it. Below the minimum of 2, so
the call is refused and nothing is posted. Sending one row further back is enough.

Either call sent a second time, before anything else is posted, posts nothing at all: the last
posted transaction is found at the same row, every row is skipped and `inserted` comes back empty.
The endpoint is safe to retry.

## Errors

Every error leaves the database untouched: **the whole call is one database transaction**, the
request's own, so a row that fails takes with it the rows inserted before it in the same call.
There is no partial post to clean up, and a failed call can be fixed and sent again.

| Error | When |
|-------|------|
| "Send the statement rows as a non-empty list in "data"." | `data` missing, empty, or not a list. |
| "Row _n_ has no Bank Account / Date / Closing Balance." | A row is missing one of the three fields every row must carry. |
| "Row _n_ has a Date that cannot be read: ..." | A date Frappe cannot parse. |
| "The data is for 2 Bank Accounts (...). Post one Bank Account per call." | Rows of more than one account in one call. |
| "Bank Account _x_ does not exist." | |
| "_x_ has no opening balance. Ask your administrator to add one (even if it is zero)." | The account has no BRS Opening Date, so there is nothing to append to. A TM Admin adds the opening transaction first. |
| "_x_, the last transaction posted for _y_ (_date_, closing balance _n_), is not in the data." | The data does not reach back to where the statement was left off, so there is no point to append from. Send data that includes the last posted transaction. When that transaction is the opening one, the message says so. The message lists the six values it was looked for by, and, where the data holds a row that is close, that row and which fields it is out on. |
| "The data confirms only _n_ of _x_'s posted transactions before it ends, and _m_ have to be confirmed." | The data ran out below `MIN_BACKWARD_MATCHES_LIMIT`. Send data that reaches further back. |
| "Row _n_ does not match _x_, which is posted at that place in _y_'s chain: _fields_ differ." | The backward walk disagreed. The message names the row, the transaction, which of the match fields differ, and what each side holds for them. |
| "Row _n_ (_date_) could not be posted: _..._" | An insert was refused. The reason is BRS Transaction's own -- "Balance is not matching.", "Earlier date than the last transaction is entered.", "A transaction can have a Deposit or a Withdrawal, not both.", and the rest of [Design.MD](Design.MD)'s insert rules. |
| "_x_ is already followed by _y_, so it is not the last transaction of _z_." | The account's latest BRS Date points at a transaction that is not the tail of the chain -- the chain and the dates are out of step, which no normal insert can cause. |

## Notes and limits

- **One Bank Account per call.** A chain belongs to an account, and so does the transaction the
  rows are appended after. Mixed data is refused rather than split.
- **The opening transaction is not created here.** `is_opening` is permlevel 1, a TM Admin's to
  set. An account without an opening transaction is refused; an account with one has to have it in
  the data while the data still reaches that far back.
- **Rows older than the opening transaction are skipped, not posted.** A statement that reaches
  back before the account was opened simply has nothing to add there; the walk stops at the start
  of the chain and those rows count in `skipped`.
- **A repeated row is refused, not guessed at.** If the same transaction appears twice in the data
  the backward walk falls out of step with the chain and reports an inconsistency, rather than
  posting a row twice or skipping a real one.
- **Rows beyond `MAX_BACKWARD_MATCHES_LIMIT` are skipped unconfirmed.** The maximum bounds the
  check, not how much may be skipped: a statement of ten thousand posted rows still skips them
  all, and confirms the last hundred.
- **Permissions are the normal ones.** Each row is inserted with `doc.insert()`, so create
  permission, validation and version history are exactly a desk user's.
- **Concurrency.** The Bank Account row is read `for_update` at the start, and BRS Transaction
  already reads the previous transaction `for_update` on every insert. Two bulk inserts on one
  account queue; one on each of two accounts do not.

## Files

| File | What |
|------|------|
| `brs_transaction.py` | `bulk_insert()` and its helpers, after the controller class. |
| `Frappe.Api.BrsTransaction.rest` | REST Client examples, bulk insert last. |
| `Bulk-Insert.MD` | This file. |
| [`page/brs_dashboard/`](../../page/brs_dashboard/BRS-Dashboard.MD) | The BRS Dashboard desk page: posts a `.json` or `.xlsx` statement here, and shows what came back. |

## Later

- Creating the opening transaction from the statement's opening balance line, for a TM Admin.
- More than one Bank Account in a call, grouped by account.
- A dry run that reports what would be skipped and inserted without posting.
