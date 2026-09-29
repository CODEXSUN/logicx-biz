# BRS Transaction

One line of a Bank Account's statement (BRS = Bank Reconciliation Statement), kept as a chain per
account: an opening transaction first, then each later transaction linked to the one before it.
Each transaction also joins the BRS Date of its date, creating that date when it is the first
transaction on it.

**Status: built, not yet run on a site.** The pseudo code is at the end.

| DocType | Module | Change |
|---------|--------|--------|
| **BRS Transaction** | LogicX HR | New. One row = one transaction of one Bank Account, linked to the previous and next transaction. |
| **BRS Date** | LogicX HR | Three new fields: the date's Opening and Closing Transaction, and its No of Transactions. Created and updated by transactions only; no user can create or update one by hand. |
| **Bank Account** (ERPNext) | -- | No change. Its BRS Opening / Closing Date still follow the BRS Dates, now created by transactions. |

## The chains

```
Bank Account "HDFC Current"
   brs_opening_date = D1                                brs_closing_date = D2

BRS Date            +------------------------+          +------------------------+
                    | D1  31-03-2026         |          | D2  01-04-2026         |
                    | is_opening = 1         |          |                        |
                    | previous: --           |<---------| previous               |
                    | next                   |--------->| next: --               |
                    | opening_transaction    |          | opening_transaction    |
                    | closing_transaction    |          | closing_transaction    |
                    | no_of_transactions = 2 |          | no_of_transactions = 2 |
                    +------------------------+          +------------------------+
                      | opening    | closing              | opening    | closing
                      |            |                      |            |
                      v            v                      v            v
                +-----------+   +-----------+       +-----------+   +-----------+
BRS Transaction | T1        |-->| T2        |------>| T3        |-->| T4        |
                | is_opening|<--|           |<------|           |<--|           |
                | roll 1    |   | roll 2    |       | roll 1    |   | roll 2    |
                +-----------+   +-----------+       +-----------+   +-----------+
                   brs_date = D1                       brs_date = D2
```

- A Bank Account has exactly one opening transaction: the head of its chain, with no previous
  transaction. Only TM Admin can mark one (Is Opening is permlevel 1).
- Every other transaction names its previous transaction; the **next** link is never typed in --
  it is set on the previous transaction when the following one is inserted.
- The chain of transactions runs across dates, never back in time, and each transaction opens at
  the balance the previous one closed at.
- A BRS Date points into the chain at its first transaction (Opening Transaction) and its latest
  (Closing Transaction), and counts its transactions (No of Transactions). Each transaction points
  back at its BRS Date and carries its place in that date (Daily Roll Number, restarting at 1 each date).
- The first transaction on a date creates its BRS Date. BRS Date's own insert rules and the Bank
  Account update still apply (see [../brs_date/Design.MD](../brs_date/Design.MD)).

### Walk-through

The inserts that build the picture above:

| Insert | Date | Opening Bal. | Withdrawal | Deposit | Closing Bal. | Previous | Roll Number | BRS Date |
|--------|------|-------------:|-----------:|--------:|-------------:|----------|-------:|----------|
| T1, Is Opening | 31-03-2026 | 0.00 | 0.00 | 50,000.00 | 50,000.00 | -- | 1 | Account has no BRS Date: creates **D1** (opening), Opening and Closing Transaction = T1, No of Transactions = 1. |
| T2 | 31-03-2026 | 50,000.00 | 5,000.00 | 0.00 | 45,000.00 | T1 | 2 | D1 exists: Closing Transaction = T2, No of Transactions = 2. |
| T3 | 01-04-2026 | 45,000.00 | 0.00 | 10,000.00 | 55,000.00 | T2 | 1 | No BRS Date on 01-04: creates **D2**. Previous BRS Date = D1 (the account's BRS Closing Date is still empty, so its BRS Opening Date), Opening and Closing Transaction = T3, No of Transactions = 1. |
| T4 | 01-04-2026 | 55,000.00 | 2,500.00 | 0.00 | 52,500.00 | T3 | 2 | D2 exists: Closing Transaction = T4, No of Transactions = 2. |

## BRS Transaction

Naming: `BRSTXN.#` -> `BRSTXN1`, `BRSTXN2`, ...

Title: Description (`title_field`, with `show_title_field_in_link`), shown in place of the name wherever a BRS Transaction is linked;
	 a transaction without a Description shows its name.

| Field | Label | Type | Notes |
|-------|-------|------|-------|
| `bank_account` | Bank Account | Link -> Bank Account, reqd | |
| `date` | Date | Date, reqd, default Today | Not before the previous transaction's date. |
| `is_opening` | Is Opening | Check | permlevel 1: only TM Admin can see or set it. |
| `brs_date` | BRS Date | Link -> BRS Date, read-only | Set after insert: the BRS Date of (`bank_account`, `date`). |
| `daily_roll_number` | Daily Roll Number | Int, read-only | Place within its date. Set after insert, once the transaction has joined its BRS Date: that date's No of Transactions, so 1 for a date's first transaction. |
| `description` | Description | Small Text | The title. |
| `reference_number` | Reference Number | Data | |
| `opening_balance` | Opening Balance | Currency | Equals the previous transaction's Closing Balance. |
| `withdrawal` | Withdrawal | Currency | Not negative; zero when there is a Deposit. |
| `deposit` | Deposit | Currency | Not negative; zero when there is a Withdrawal. |
| `closing_balance` | Closing Balance | Currency | Entered by the user, not calculated; must equal Opening Balance + Deposit - Withdrawal. |
| `previous_transaction` | Previous Transaction | Link -> BRS Transaction | Required unless `is_opening`; must be empty when it is. Same Bank Account; the account's latest transaction. |
| `next_transaction` | Next Transaction | Link -> BRS Transaction, read-only | Set by the system only; must be empty on insert. |

Sorted by creation, newest first: the chain only grows at its tail, so creation order is chain
order.

Permissions: TM User can read / create / write; TM Admin can also delete and import, and holds
permlevel 1 for Is Opening.


## BRS Date: changes

New fields, all set by the system:

| Field | Label | Type | Notes |
|-------|-------|------|-------|
| `opening_transaction` | Opening Transaction | Link -> BRS Transaction, read-only | The date's first transaction; set when the transaction creates the date. |
| `closing_transaction` | Closing Transaction | Link -> BRS Transaction, read-only | The date's latest transaction; set to the first transaction when it creates the date, then to each later one. |
| `no_of_transactions` | No of Transactions | Int, read-only, default 0 | 1 when the date is created; + 1 for each later transaction on the date. |

Permissions: No Users can create/update 'BRS Date's by hand. TM User and TM Admin keep read (TM
Admin also delete, which BRS Date's delete guard still refuses), and import is off. Administrator,
who bypasses role permissions, is stopped by BRS Date's `validate`: it refuses any insert that
does not come from a transaction.


## Insert

Checks run in `validate`, before the row is written; the first failure stops the insert.
Every message is the pseudo code's.

| # | Rule | Error |
|---|------|-------|
| 1 | Deposit and Withdrawal are not negative. | "Deposit and Withdrawal cannot be negative." |
| 2 | Deposit and Withdrawal are not both non-zero. | "A transaction can have a Deposit or a Withdrawal, not both." |
| 3 | Not opening: Deposit or Withdrawal is non-zero. An opening transaction may have neither, so an account can open at zero. | "Enter a Deposit or a Withdrawal: only the opening transaction can have neither." |
| 4 | Opening Balance + Deposit - Withdrawal = Closing Balance. | "Balance is not matching." |
| 5 | `next_transaction` is empty. | "Leave Next Transaction empty: it is set by the BRS Transaction that follows this one." |
| 6 | Opening: `previous_transaction` is empty. | "An opening BRS Transaction starts the chain, so it cannot have a Previous Transaction." |
| 7 | Not opening: `previous_transaction` is set. | When the account has no BRS Opening Date yet: "Opening balance is required. Ask your administrator to add one (even if it is zero)." Otherwise: "Previous Transaction is required unless this is the opening transaction." |
| 8 | The previous transaction belongs to the same Bank Account. | "Previous Transaction belongs to another Bank Account." |
| 9 | The previous transaction has no next transaction yet (it is the tail). | "{previous} is already followed by {next}" |
| 10 | Opening Balance = the previous transaction's Closing Balance. | "Opening Balance does not match the previous transaction's Closing Balance." |
| 11 | Date is not before the previous transaction's Date. | "Earlier date than the last transaction is entered." |

Rule 8 comes before 9-11 so that a transaction of another account is named as such, not
reported as a balance or date mismatch.

By rules 8, 9 and 11 the transaction's date is either that of the account's latest BRS Date or a
new, later one.

Then, in `after_insert`:

1. `previous_transaction.next_transaction = this` (when there is a previous transaction).
2. `update_brs_transaction(this)`, a function of BRS Date:

   ```
   if this.is_opening:
       if the Bank Account has any BRS Date  -> error "Opening balance is already added"
       brs_date = insert BRS Date(bank_account, date, is_opening = 1,
                                  opening_transaction = this, closing_transaction = this,
                                  no_of_transactions = 1, amounts = this's)
   else:
       brs_date = the BRS Date of (bank_account, date)
       if there is none:
           if Bank Account.brs_opening_date is empty -> error "{account} has no BRS Opening Date."
           brs_date = insert BRS Date(bank_account, date,
                                      previous_brs_date = brs_closing_date or brs_opening_date,
                                      opening_transaction = this, closing_transaction = this,
                                      no_of_transactions = 1, amounts = this's)
       else:
           brs_date.closing_transaction = this
           brs_date.no_of_transactions += 1
           brs_date.withdrawal += this.withdrawal
           brs_date.deposit += this.deposit
           brs_date.closing_balance = this.closing_balance
   this.brs_date = brs_date
   ```

   `amounts = this's`: the new BRS Date's Opening Balance, Withdrawal, Deposit and Closing
   Balance are this transaction's own.

   The BRS Opening Date check is the pseudo code's assert: a guard against a Bank Account edited
   by hand, since rule 7 already keeps a normal transaction off an account without an opening.
   Inserting a BRS Date runs its own rules and `after_insert`, so the Bank Account's BRS Opening /
   Closing Date move with it.
3. `daily_roll_number = brs_date.no_of_transactions` -- the count now includes this transaction, so a
   date's first transaction is roll 1.

An error in `after_insert` still rolls back the whole insert: the transaction row, the previous
transaction's next link and any BRS Date it created or changed.

## Form

Picking the Previous Transaction by hand would mean finding the account's tail among all
transactions, so the form fills it. As soon as the Bank Account is picked on a new transaction,
`get_chain_tail()` is asked for the account's last posted transaction -- its latest BRS Date's
Closing Transaction, the same one `bulk_insert` appends after -- and the form sets:

| Field | Filled with |
|-------|-------------|
| `previous_transaction` | The account's last posted transaction. |
| `opening_balance` | That transaction's Closing Balance. |

Both stay editable, and the insert works them out again (rules 7-10): what the form fills is a
head start, not the check.

- Is Opening starts the chain, so ticking it clears both; unticking it fills them again.
- An account with no BRS Opening Date yet has no tail: both are cleared and the form says
  "{account} has no opening balance yet. Ask your administrator to add one (even if it is zero)."
  -- as a passing alert, since the next transaction on such an account is the opening one, which
  only TM Admin can enter.
- Only a new transaction is filled: an existing one cannot be updated at all.
- `get_chain_tail()` reads without locking the Bank Account, unlike `bulk_insert`'s call, which
  goes on to append; a form that is only being filled in must not hold up a posting.

## Update and delete

Not implemented yet. Saving an existing BRS Transaction fails with "Updating a BRS Transaction is
not implemented yet."; deleting one fails with "Deleting a BRS Transaction is not implemented
yet."

## Implementation notes

- **Checks in `validate`, links in `after_insert`.** The BRS Date links back to the transaction,
  and Frappe refuses a link to a row not yet in the database; so the BRS Date is created or
  updated, and `brs_date` and `daily_roll_number` written with `db_set`, only after the transaction
  row exists.
- **BRS Date inserted with `ignore_permissions`.** No role has create on BRS Date any more, and
  the date is a side effect of the transaction, not the user's own entry. This also keeps Frappe
  from clearing the permlevel-1 Is Opening on the opening date. The insert also carries the
  `from_brs_transaction` flag, without which BRS Date's `validate` refuses it.
- **Update guard in `validate`, not `on_update`** -- as in BRS Date: Frappe runs `on_update` after
  an insert too. `validate` refuses only when `self.flags.in_insert` is false.
- **Other rows written with `frappe.db.set_value`.** Saving the previous transaction or an
  existing BRS Date (Closing Transaction, No of Transactions) would hit their "not implemented
  yet" update guards.
- **Concurrent inserts.** Read the previous transaction `for_update`, as BRS Date reads its
  previous date. Every new transaction of an account must follow the same tail, so this lock
  queues them all: two transactions cannot both follow one, both create the same BRS Date, or
  both take the same Daily Roll Number and No of Transactions.
- **Balances compared at currency precision** (`flt(..., precision)` on both sides) in rules 4 and
  10, not as raw floats, where 0.1 + 0.2 != 0.3.

## Files

| File | What |
|------|------|
| `logicx_hr/doctype/brs_transaction/brs_transaction.json` | The DocType. |
| `logicx_hr/doctype/brs_transaction/brs_transaction.py` | Insert rules, chain links, Daily Roll Number, update / delete guards, `get_chain_tail()` and `bulk_insert()`. |
| `logicx_hr/doctype/brs_transaction/brs_transaction.js` | The form script: fills Previous Transaction and Opening Balance from the Bank Account's chain. |
| `logicx_hr/doctype/brs_transaction/Bulk-Insert.MD` | Posting a whole bank statement in one call: what is skipped, what is appended, and what is refused. |
| `logicx_hr/doctype/brs_date/brs_date.json` | `opening_transaction`, `closing_transaction`, `no_of_transactions`; create and write removed from TM User and TM Admin (all permlevels); import off. |
| `logicx_hr/doctype/brs_date/brs_date.py` | `update_brs_transaction()`, and `insert_brs_date()` for a date's first transaction. |
| `logicx_hr/doctype/brs_date/Design.MD` | The new fields and permissions; BRS Dates now created by transactions. |

## Later

- Update and delete of a BRS Transaction (see above).

## pseudo code

BRS Date:
```
      function Update_BRS_Transaction (new_brs_transaction)
            if new_brs_transaction.'Is Opening' is checked then
                  get count of 'BRS Date' entries where 'Bank Account' = new_brs_transaction.'Bank Account'
                  if count != 0
                        throw 'Opening balance is already added'
                  end
                  create new_opening_brs_date with
                        Bank Account = new_brs_transaction.'Bank Account'
                        Date = new_brs_transaction.'Date'
                        Is Opening = True
                        Opening Transaction = new_brs_transaction
                        Closing Transaction = new_brs_transaction
                        No of Transactions = 1
                  set brs_date = new_opening_brs_date
                  is_new_brs_date = true
            else
                  set brs_date = existing where 'Bank Account' = new_brs_transaction.'Bank Account' and 'Date' = new_brs_transaction.'Date'

                  if brs_date is null
                        assert 'Bank Account'.'Opening BRS Date' is not null
                              else throw '{Bank Account} has no BRS Opening Date'
                        create new_brs_date with
                              Bank Account = new_brs_transaction.'Bank Account'
                              Date = new_brs_transaction.'Date'
                              Previous BRS Date = new_brs_transaction.'Bank Account'.'Closing BRS Date' -coalese - 'Opening BRS Date'
                              Opening Transaction = new_brs_transaction
                              Closing Transaction = new_brs_transaction
                              No of Transactions = 1
                        set brs_date = new_brs_date
                        is_new_brs_date = true
                  else
                        update brs_date.'Closing Transaction' = new_brs_transaction, 'No of Transactions' += 1
                        is_new_brs_date = false
                  end
            end

            update new_brs_transaction.'BRS Date' = brs_date
```

BRS Transaction:
```
      on insert
            if Deposit < 0 or Withdraw < 0
                  throw "Deposit and Withdrawal cannot be negative."

            if Deposit != 0 and Withdraw != 0
                  throw 'A transaction can have a Deposit or a Withdrawal, not both'

            if Is Opening = true
                  # nothing to do (because we support zero as opening balance)
            else
                  if Deposit == 0 and Withdraw == 0
                        throw 'Enter a Deposit or a Withdrawal: only the opening transaction can have neither'
            end

            if Opening Balance + Deposit - Withdraw != Closing Balance
                  throw 'balance is not matching'


            if 'Next Transaction' is set then
                  throw 'Leave Next Transaction empty: it is set by the BRS Transaction that follows this one'
            end

            if 'Is Opening' is checked then
                  if 'Previous Transaction' is set then
                        throw 'An opening BRS Transaction starts the chain, so it cannot have a Previous Transaction'
            else
                  if 'Previous Transaction' is not set then
                        if 'Bank Account'.'Opening BRS Date' is null
                              throw 'Opening balance is required. Ask your administrator to add one (even if it is zero)'
                        throw 'Previous Transaction is required unless this is the opening transaction'
            end

            if 'Previous Transaction' is set then
                  if 'Previous Transaction'.'Bank Account' != 'Bank Account'
                        throw 'Previous Transaction belongs to another Bank Account'
                  if 'Previous Transaction'.'Next Transaction' is set then
                        throw '{Previous Transaction} is already followed by {Previous Transaction.Next Transaction}'
                  set 'Previous Transaction'.'Next Transaction' = this.name
                  if 'Opening Balance' != 'Previous Transaction'.'Closing Balance'
                        throw 'Opening Balance does not match the previous transaction's Closing Balance'
                  if Date < 'Previous Transaction'.'Date'
                        throw 'Earlier date than the last transaction is entered'
            end

            'BRS Date'.Update_BRS_Transaction (this)
            set 'Daily Roll Number' = 'BRS Date'.'No of Transactions'

      on update
            throw 'Not implemented yet'

      on delete
            throw 'Not implemented yet'
```
