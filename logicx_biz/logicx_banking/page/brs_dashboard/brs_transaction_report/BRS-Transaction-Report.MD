# BRS Transaction Report

The [BRS Dashboard](../BRS-Dashboard.MD)'s **Transaction** tab: BRS Transactions as a table, narrowed
by three filters. Read-only; nothing is written from here.

**Status: built, not yet run on a site.**

| | |
|---|---|
| **Tab** | **Transaction** on `/app/brs-dashboard` (`../brs_dashboard.json`; System Manager, TM Admin, TM User) |
| **Reads** | BRS Transaction, with the user's own permissions on it |
| **Files** | `brs_transaction_report.js` (the tab), `brs_transaction_report.py` (its two methods) -- both in this folder |

## Columns

| Column | Field |
|--------|-------|
| **Account** | `bank_account` |
| **Date** | `date`, in the user's date format |
| **Deposit** | `deposit`; blank rather than a zero, since a transaction is a deposit or a withdrawal, never both |
| **Withdraw** | `withdrawal`; blank rather than a zero, the same way |
| **Reference Number** | `reference_number` |
| **Description** | `description`, wrapped onto as many lines as it takes |

Every column sorts from its header, and the table's own filter row narrows what is already on screen.

**A click on a row opens its BRS Transaction**; Ctrl- or Cmd-click opens it in a new browser tab. A
click that ends a text selection does not, so a reference number can still be copied out of the
table. The rows carry the transaction's `name` for this, though no column shows it.

## Filters

All three are optional; a blank one narrows nothing. A change to any of them -- clearing one
included -- fetches the table again.

| Filter | What it does |
|--------|--------------|
| **Bank Account** | The transactions of one account. The dropdown lists the company's own bank accounts (**Is Company Account** ticked) -- **disabled ones included**, listed after the rest and marked *Disabled*. |
| **Date** | The transactions of one day. Cleared, every day's. |
| **Search** | Matches **Reference Number** or **Description**, anywhere in either. |

The Bank Account dropdown is its own query, `bank_account_query`, because Frappe's link search leaves
out anything disabled. Frappe also validates the picked value through that same query, so an account
the dropdown lists is one the filter accepts. The query asks for **read** on BRS Transaction rather
than on Bank Account: Bank Account's permissions are ERPNext's accounting roles, which the TM roles
need not hold.

## Order, and how much is shown

Oldest first: by date, then by Bank Account, and within one account's day in the order the bank
printed it (`daily_roll_number`). That is how a statement reads.

One answer carries at most **500** rows (`ROW_LIMIT` in `brs_transaction_report.py`). With no Bank
Account or Date picked, the report is every account's whole history; past the limit, the table holds
the **latest** 500 and the footer says so, asking for a narrower filter. Otherwise the footer gives
the count.

## When it is fetched

The tab fetches nothing until it is first opened, and fetches again every time it comes back on
screen -- an import on the **Import** tab is what puts new transactions here. While a new answer is
on its way, the table already on screen stays there.
