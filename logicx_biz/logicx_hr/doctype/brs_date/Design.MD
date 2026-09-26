# BRS Date

The dates on which a Bank Account is reconciled (BRS = Bank Reconciliation Statement), kept as a
chain per account: an opening date first, then each later date linked to the one before it.

| DocType | Module | Purpose |
|---------|--------|---------|
| **BRS Date** | LogicX HR | One row = one BRS date of one Bank Account, linked to the previous and next date. |
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

Permissions: TM User can read / create / write; TM Admin can also delete and import.

## Insert

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

## Update and delete

Not implemented yet. Saving an existing BRS Date fails with "Updating a BRS Date is not
implemented yet."; deleting one fails with "Deleting a BRS Date is not implemented yet."

Rename is still allowed (`allow_rename`); Frappe rewrites the Previous / Next links and the Bank
Account fields that point at the renamed date.

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
  cannot both follow the same date, nor both take the account's opening.
- **Uniqueness in the database.** Besides rule 1, `on_doctype_update` adds a unique index on
  (`bank_account`, `date`), so a duplicate that races past `validate` is still rejected.
- **Title does not follow later changes.** It is set on insert; renaming the Bank Account's
  Account Name leaves existing titles as they were.

## Files

| File | What |
|------|------|
| `logicx_hr/doctype/brs_date/brs_date.json` | The DocType. |
| `logicx_hr/doctype/brs_date/brs_date.py` | Insert rules, chain links, update / delete guards, unique index. |
| `logicx_erp/bank_account.py` | `update_brs_date()` -- Bank Account's opening / closing date. |
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
            throw 'Not implemented yet'
```

## Not done yet

- Update and delete of a BRS Date (see above).
- The Previous BRS Date picker lists the BRS Dates of every Bank Account; rule 5 rejects a wrong
  pick only on save. A form script could limit it to the same account's tail.
- The Bank Account's two fields are editable by hand; nothing stops them from drifting off the chain.
