# BRS Date

The dates on which a Bank Account is reconciled (BRS = Bank Reconciliation Statement), kept as a
chain per account: an opening date first, then each later date linked to the one before it.

| DocType | Module | Purpose |
|---------|--------|---------|
| **BRS Date** | LogicX Banking | One row = one BRS date of one Bank Account, linked to the previous and next date. |
| **BRS Transaction** | LogicX Banking | Creates the BRS Date of its date, points it at its first and latest transaction, and deletes it when the last transaction left on it is deleted (see [../brs_transaction/Design.MD](../brs_transaction/Design.MD)). |
| **Bank Account** (ERPNext) | -- | Two custom fields point at the first and the latest BRS Date of the account. |

## The chain

```
Bank Account "HDFC Current"
   brs_opening_date ---------------+                          brs_closing_date
                                   |                                 |
                                   v                                 v
                          +----------------+    +----------------+    +----------------+
                          | 31-03-2026     |    | 30-04-2026     |    | 31-05-2026     |
                          | is_opening = 1 |    |                |    |                |
                          | previous: --   |<---| previous       |<---| previous       |
                          | next           |--->| next           |--->| next: --       |
                          +----------------+    +----------------+    +----------------+
```

- A Bank Account has exactly one opening BRS Date: the head of its chain, with no previous date.
- Every other BRS Date names its previous date; the **next** link is never typed in -- it is set on
  the previous date when the following date is inserted.
- `Bank Account.brs_opening_date` is the head; `Bank Account.brs_closing_date` is the latest
  non-opening date (the tail). With only the opening date in place, the closing date is empty.
- No user creates, edits or deletes a BRS Date: the first BRS Transaction on a date creates it,
  each later one on that date updates it, and deleting the last one left on it deletes it.

## BRS Date

Naming: `BRSDATE.#` -> `BRSDATE1`, `BRSDATE2`, ... Title: `"{Date} : {Account Name}"`, e.g.
`24-09-2026 : HDFC Current`, shown in place of the name wherever a BRS Date is linked.

| Field | Type | Notes |
|-------|------|-------|
| `bank_account` | Link -> Bank Account, reqd | |
| `date` | Date, reqd, default Today | Unique together with `bank_account`. |
| `is_opening` | Check | permlevel 1: only TM Admin can see or set it. |
| `previous_brs_date` | Link -> BRS Date | Required unless `is_opening`; must be empty when it is. |
| `next_brs_date` | Link -> BRS Date | Set by the system only; must be empty on insert. |
| `title` | Data, hidden, read-only | Filled on insert from `date` and Bank Account's `account_name`. |
| `opening_transaction` | Link -> BRS Transaction, read-only | The date's first transaction; set when it creates the date. |
| `closing_transaction` | Link -> BRS Transaction, read-only | The date's latest transaction; set to the first on insert, then to each later one. |
| `no_of_transactions` | Int, read-only, default 0 | 1 on insert; + 1 for each later transaction on the date. |
| `opening_balance` | Currency, read-only | Opening Transaction's Opening Balance; set on insert. |
| `withdrawal` | Currency, read-only | Sum of Withdrawal over the date's BRS Transactions: the first's on insert, + each later one's. |
| `deposit` | Currency, read-only | Sum of Deposit over the date's BRS Transactions: the first's on insert, + each later one's. |
| `closing_balance` | Currency, read-only | Closing Transaction's Closing Balance: the first's on insert, then each later one's. |

The four amounts are stored, not computed on read, and kept up to date by `update_brs_transaction()`
as each transaction is added and `remove_brs_transaction()` as one is deleted. Since the date's
transactions chain on from one another, Opening Balance + Deposit - Withdrawal = Closing Balance.
Adding to and subtracting from the sums is enough while a BRS Transaction cannot be updated, and
while only the date's last transaction can be deleted; once a transaction can be updated, the
date's sums must be recomputed.

Permissions: no user can create, update or delete a BRS Date by hand. TM User and TM Admin can
read; TM Admin also holds delete, which the delete guard below refuses to anyone but a BRS
Transaction. Import is off. BRS Transactions insert and delete BRS Dates with `ignore_permissions`.
Administrator bypasses role permissions, so `validate` and `on_trash` also refuse any insert or
delete that does not come from a transaction (see Insert and Delete).

## Insert

A BRS Date is inserted only by `update_brs_transaction()`, for the first BRS Transaction on its
date; that sets `previous_brs_date` to the account's BRS Closing Date, or its BRS Opening Date
while the closing date is empty. Any other insert -- by hand, import, API or console, Administrator's
included -- fails first with "A BRS Date is created by the first BRS Transaction on its date, not
by hand." `update_brs_transaction()` marks its insert with the `from_brs_transaction` flag, which
nothing else sets.

Checks run in `validate`, before the row is written; the first failure stops the insert.

| # | Rule | Error |
|---|------|-------|
| 1 | No other BRS Date for the same Bank Account and Date. | "{account} already has a BRS Date on {date}: {link}" |
| 2 | `next_brs_date` is empty. | "Leave Next BRS Date empty: it is set by the BRS Date that follows this one." |
| 3 | Opening: `previous_brs_date` is empty. | "An opening BRS Date starts the chain, so it cannot have a Previous BRS Date." |
| 4 | Not opening: `previous_brs_date` is set. | "Previous BRS Date is required unless this is the opening date." |
| 5 | The previous date belongs to the same Bank Account. | "Previous BRS Date {link} belongs to {account}, not {account}." |
| 6 | `date` is strictly after the previous date's date. | "Date must be after the Previous BRS Date's date, {date}." |
| 7 | The previous date has no next date yet (it is the tail). | "{previous} is already followed by {next}" |

Then, in `after_insert`:

1. `previous_brs_date.next_brs_date = this` (when there is a previous date).
2. `update_brs_date(this)` on the Bank Account:

   ```
   if this.is_opening:
       if bank_account.brs_opening_date is set  -> error "{account} already has a BRS Opening Date: {link}"
       bank_account.brs_opening_date = this
   else:
       if bank_account.brs_closing_date == this -> nothing to do
       bank_account.brs_closing_date = this
   ```

An error in `after_insert` still rolls back the whole insert, the BRS Date row included.

## Update

Not implemented yet. Saving an existing BRS Date fails with "Updating a BRS Date is not
implemented yet." A later BRS Transaction on the date changes its Closing Transaction, No of
Transactions and amounts with `frappe.db.set_value`, which the guard does not see.

`allow_rename` is still set, but renaming needs write permission, which no role has now.

## Delete

A BRS Date is deleted only by `remove_brs_transaction()`, when the last BRS Transaction left on it
is deleted -- the date is then an orphan. Any other delete -- by hand, API or console,
Administrator's included -- fails with "A BRS Date is deleted with the last BRS Transaction on it,
not by hand." The delete carries the same `from_brs_transaction` flag as the insert, which nothing
else sets.

Checks run in `on_trash`, before the row goes:

| # | Rule | Error |
|---|------|-------|
| 1 | The delete comes from a BRS Transaction. | "A BRS Date is deleted with the last BRS Transaction on it, not by hand." |
| 2 | `next_brs_date` is empty: only the tail of the chain is deleted. | "{this} is followed by {next}, so it is not the last BRS Date of {account}." |

Then, still in `on_trash`:

1. `previous_brs_date.next_brs_date = empty` (when there is a previous date).
2. `remove_brs_date(this)` on the Bank Account, the mirror of `update_brs_date()`:

   ```
   if this.is_opening:
       if bank_account.brs_closing_date is set -> error "{this} is the opening BRS Date of {account}, whose latest is {link}"
       bank_account.brs_opening_date = empty
   else:
       if bank_account.brs_closing_date != this -> error "{this} is not the BRS Closing Date of {account}."
       bank_account.brs_closing_date = the previous date, or empty when that is the opening date
   ```

   An opening date is never a BRS Closing Date, so an account left with only its opening date is
   left with an empty closing date -- as it stood before its second date was added. Deleting the
   opening date itself clears BRS Opening Date, and the account is then as it was before any
   transaction: its next one opens it again.

An error in `on_trash` rolls back the whole delete, the BRS Transaction that started it included.

## Form

Below the four amounts, a **Transactions** section lists the BRS Transactions of this date -- the
`transactions_html` HTML field, filled by `brs_date.js`:

| Column | Notes |
|--------|-------|
| ID | The transaction's name, linked to its form. |
| Withdrawal | Blank rather than zero: a transaction carries a Deposit or a Withdrawal, never both. |
| Deposit | As above. |
| Reference Number | |
| Description | Wraps onto as many lines as the bank's narration takes. |

Read with `frappe.db.get_list` on `brs_date = {this}`, ordered by `daily_roll_number` -- the order
the date's transactions were posted in -- and rendered with frappe-datatable, so the columns sort
and filter in place. Nothing is written from the form: a BRS Date's transactions are created and
deleted only through BRS Transaction. The four amounts above the table are the totals over exactly
these rows.

## Implementation notes

- **Update guard in `validate`, not `on_update`.** Frappe runs `on_update` after an insert as well,
  so a throw there would block every new date. `validate` refuses only when
  `self.flags.in_insert` is false, i.e. a save of an existing row.
- **Links written with `frappe.db.set_value`, not a document save.** Saving the previous BRS Date
  would hit the update guard; saving the Bank Account would re-run ERPNext's own Bank Account
  validations, which have nothing to do with these fields. The trade-off: those two writes leave
  no entry in the documents' version history.
- **Concurrent inserts.** The previous BRS Date row (rule 5-7) and the Bank Account row are read
  `for_update`, so they stay locked until the transaction ends: two dates saved at the same moment
  cannot both follow the same date, nor both take the account's opening. A delete reads the same
  Bank Account row `for_update`.
- **Links cleared before the row goes.** Frappe refuses to delete a row that other documents still
  link to, and runs `on_trash` before that check: the previous date's next link and the account's
  BRS Opening / Closing Date are cleared there, and the transaction clears its own BRS Date link
  before asking for the delete.
- **Uniqueness in the database.** Besides rule 1, `on_doctype_update` adds a unique index on
  (`bank_account`, `date`), so a duplicate that races past `validate` is still rejected.
- **Title does not follow later changes.** It is set on insert; renaming the Bank Account's
  Account Name leaves existing titles as they were.

## Files

| File | What |
|------|------|
| `logicx_banking/doctype/brs_date/brs_date.json` | The DocType. |
| `logicx_banking/doctype/brs_date/brs_date.js` | The form's Transactions table (see Form). |
| `logicx_banking/doctype/brs_date/brs_date.py` | Insert and delete rules, chain links, update guard, unique index; `update_brs_transaction()`, `insert_brs_date()` and `remove_brs_transaction()` for BRS Transaction. |
| `logicx_erp/bank_account.py` | `update_brs_date()` and `remove_brs_date()` -- Bank Account's opening / closing date. |
| `fixtures/custom_field.json` | `Bank Account-brs_opening_date`, `Bank Account-brs_closing_date` (inserted after `company`). |
| `hooks.py` | The two custom fields listed under `fixtures`. |

## pseudo code

Bank Account:
```
      function Update_BRS_Date (new_brs_date)
            if new_brs_date.'Is Opening' is checked then
                  if 'BRS Opening Date' is set yet then
                        raise error.
                  set 'BRS Opening Date' = new_brs_date.name
            else
                  if ('BRS Closing Date' == new_brs_date.name)
                        return
                  set 'BRS Closing Date' = new_brs_date.name
            end
      end

      function Remove_BRS_Date (deleted_brs_date)
            if deleted_brs_date.'Is Opening' is checked then
                  if 'BRS Closing Date' is set then
                        raise error. (it is not the account's latest date)
                  set 'BRS Opening Date' = empty
            else
                  if 'BRS Closing Date' != deleted_brs_date.name then
                        raise error.
                  if deleted_brs_date.'Previous BRS Date'.'Is Opening' is checked then
                        set 'BRS Closing Date' = empty
                  else
                        set 'BRS Closing Date' = deleted_brs_date.'Previous BRS Date'
            end
      end
```

BRS Date:
```
      on insert
            if 'Next BRS Date' is set then
                  raise error. (becuase it will be auto-updted by the next-'BRS Date')
            end

            if 'Is Opening' is checked then
                  if 'Previous BRS Date' is set then
                        raise error.
            else
                  if 'Previous BRS Date' is not set then
                        raise error.
            end

            if 'Previous BRS Date' is set then
                  if 'Previous BRS Date'.'Next BRS Date' is set then
                        throw error
                  set 'Previous BRS Date'.'Next BRS Date' = this.name
            end

            'Bank Account'.Update_BRS_Date (this)

      on update
            throw 'Not implemented yet'

      on delete
            if the delete does not come from a BRS Transaction then
                  throw 'A BRS Date is deleted with the last BRS Transaction on it, not by hand'

            if 'Next BRS Date' is set then
                  throw '{this} is followed by {Next BRS Date}, so it is not the last BRS Date of {Bank Account}'

            if 'Previous BRS Date' is set then
                  set 'Previous BRS Date'.'Next BRS Date' = empty

            'Bank Account'.Remove_BRS_Date (this)
```

BRS Date amounts:
```
      Opening Balance = "Opening Transaction"."Opening Balance"
      Withdrawal      = Sum(Withdrawal) from "BRS Transaction" where "BRS Date" = {{"BRS Date"}}
      Deposit         = Sum(Deposit)    from "BRS Transaction" where "BRS Date" = {{"BRS Date"}}
      Closing Balance = "Closing Transaction"."Closing Balance"
```

## Not done yet

- Update of a BRS Date (see above).
- The Bank Account's two fields are editable by hand; nothing stops them from drifting off the chain.
