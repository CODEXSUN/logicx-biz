# Mobile Contact

Mobile numbers, and the Customers each one belongs to. **Mobile Contact** holds the number itself
and is named after it. **Mobile Contact Customer** links one number to one Customer. Each pair is
its own row, so a number can be linked to several Customers and a Customer to several numbers.

| DocType | Module | Purpose |
|---------|--------|---------|
| **Mobile Contact** | LogicX HR | One row = one mobile number, named after the number. |
| **Mobile Contact Customer** | LogicX HR | One row = one Mobile Contact linked to one Customer. Each pair appears once. |
| **Customer** (ERPNext) | -- | The other end of the link. Its `customer_name` is copied onto each Mobile Contact Customer row. |

## How it works

```
Mobile Contact "9876543210"
   |
   +-- Mobile Contact Customer "9876543210 - CUST-0001"
   |      mobile_contact = "9876543210"
   |      customer       = "CUST-0001"  ------> Customer "CUST-0001"
   |      customer_name  = "Sri Ganesh Stores"   (fetched from the Customer; the row's title)
   |
   +-- Mobile Contact Customer "9876543210 - CUST-0007"
          mobile_contact = "9876543210"
          customer       = "CUST-0007"  ------> Customer "CUST-0007"
          customer_name  = "Ganesh Traders"
```

The Customer IDs above are only examples. The second part of a row's name is whatever the
Customer's own name/ID is, which depends on how Customers are named on the site.

## Mobile Contact

Naming is `field:mobile_number`, so the name is the number, e.g. `9876543210`. Rename is off: the
number is the record, so a Mobile Contact keeps its number for good.

| Field | Label | Type | Notes |
|-------|-------|------|-------|
| `mobile_number` | Mobile Number | Data, reqd, unique | In list view. |

Sort: `modified` ascending, like Crate and Rack.

### The number check

`validate` trims `mobile_number`, then calls `validate_mobile_number()` from
`logicx_erp/mobile_validation.py`. That is the same check Address, Contact, Customer and Supplier
run through `doc_events` in `hooks.py`. The number must be exactly 10 digits, with no `+91`, spaces
or dashes. Anything else fails with "Mobile Number must contain exactly 10 digits (numbers only):
{value}".

Frappe sets the name from the field, trimmed, before `validate` runs. Trimming the field as well
keeps the two equal for rows coming in through import or the API, where the form's own trimming
doesn't run. The form trims the number as it is typed (the `mobile_number` handler in
`mobile_contact.js`), as Enquiry and API One do.

With rename off, the form and the API refuse to rename a Mobile Contact, but code can still
rename one with `force`. That rename doesn't run `validate`, yet Frappe writes the new name into
`mobile_number`. So `before_rename` trims the new name, runs the same check on it, and returns the
trimmed name for Frappe to use. A forced rename to anything that isn't 10 digits fails with the
same error and changes nothing.

### Customers button

On a saved Mobile Contact, the **Customers** button opens the Mobile Contact Customer list filtered
to `mobile_contact` = this number. A new record has no button, since nothing can link to it yet.

## Mobile Contact Customer

Naming is `format:{mobile_contact} - {customer}`, e.g. `9876543210 - CUST-0001`. Rename is off,
because the name is built from the two links.

The title is `customer_name`, with **Show Title in Link Fields** on, so a link to a row shows the
Customer's name next to the ID.

The search fields are `mobile_contact`, `customer` and `customer_name`. A Link field pointing at
Mobile Contact Customer finds a row by the number, the Customer ID or the Customer's name.

Sort: `modified` descending.

| Field | Label | Type | Notes |
|-------|-------|------|-------|
| `mobile_contact` | Mobile Contact | Link -> Mobile Contact, reqd | In list view and standard filters. |
| `customer` | Customer | Link -> Customer, reqd | In list view and standard filters. |
| `customer_name` | Customer Name | Data, read-only, `fetch_from: customer.customer_name` | Fetched from the Customer each time the row is saved, and kept current when the Customer's name changes (see Keeping Customer Name current). In list view. |

### One row per pair

Two guards keep a Mobile Contact from being linked to the same Customer twice:

1. **`validate_duplicate()`**, in `validate`, looks for another row with the same `mobile_contact`
   and `customer`. If it finds one, the save fails with "{number} is already linked to {customer
   name}: {link to the existing row}", raised as `DuplicateEntryError` under the title "Duplicate
   Mobile Contact Customer".
2. **A unique index** on (`mobile_contact`, `customer`), added by `on_doctype_update()` when the
   site is migrated. It is the database's own guard, should two saves race past
   `validate_duplicate()`.

The name is unique too, but it isn't enough on its own. After a Customer is renamed, the row's
`customer` link changes and its name doesn't, so the name no longer reflects the pair.
The index is on the link columns, so it still holds.

### Keeping Customer Name current

`customer_name` is a stored copy, not read live from the Customer. It has to be stored because the
title, the search fields and the list view all run in SQL, and none of them can use a field
without a column. A Frappe virtual field would break all three.

To keep the copy current, `update_customer_name()` in `mobile_contact_customer.py` runs as a
`doc_events` hook on Customer, from `hooks.py`. It writes the Customer's current `customer_name`
onto every Mobile Contact Customer row linked to it. It runs on two events:

| Event | When | Why |
|-------|------|-----|
| `on_update` | A Customer is saved and `customer_name` changed. Other saves skip it. | The name is edited on the Customer. |
| `after_rename` | A Customer is renamed. | Where Customers are named by Customer Name, ERPNext's own `after_rename` sets `customer_name` with `db_set`, so `on_update` never runs. |

The hook reads `customer_name` from the database rather than from the document, so it gets the
value ERPNext's `after_rename` has just written. It updates all the rows in a single
`frappe.db.set_value` with `update_modified=False`. The rows' `modified` stays as it was, and no
version history is written.

## Permissions

The same on both doctypes:

- **TM User:** read, create, write, select, report, export, email, print and share. No delete, no
  import.
- **TM Admin:** full rights, including delete and import, plus permlevel 1.

## Deleting

Frappe's link check refuses to delete a Mobile Contact, or a Customer, while a Mobile Contact
Customer row links to it. A TM Admin deletes those rows first.

## Where it shows

- **LogicX HR Home** workspace: a Mobile Contact shortcut.
- **LogicX HR** sidebar: Mobile Contact, under Masters.

Mobile Contact Customer has no workspace or sidebar entry. Users reach it through the Customers
button, or by searching for it.

## Limitations

- **Row names go stale after a Customer rename.** Renaming a Customer updates the `customer` link
  on its Mobile Contact Customer rows, but not their names. A row named `9876543210 - CUST-0001` can
  end up linking a Customer with a different ID. The unique index still holds (see One row per
  pair).
- **Customer Name only follows changes that run hooks.** A Customer's name changed by direct SQL,
  or by a script that skips hooks, isn't copied onto its rows. They pick it up the next time each
  one is saved. Form edits, Data Import and renames all run the hooks.
- **No Connections either way.** Neither Mobile Contact nor Customer lists its Mobile Contact
  Customer rows under Connections. On Mobile Contact, the Customers button stands in for that.
  Customer would need an `override_doctype_dashboards` entry in `hooks.py`.
- **Separate from other mobile numbers.** Mobile Contact doesn't read or update `Customer.mobile_no`
  or Contact phone numbers, and nothing creates Mobile Contacts from them.

## Files

| File | What |
|------|------|
| `logicx_hr/doctype/mobile_contact/mobile_contact.json` | The Mobile Contact DocType. |
| `logicx_hr/doctype/mobile_contact/mobile_contact.py` | Trims and checks the number on save (`validate`) and on a forced rename from code (`before_rename`). |
| `logicx_hr/doctype/mobile_contact/mobile_contact.js` | Customers button; trims the number as it is typed. |
| `logicx_hr/doctype/mobile_contact_customer/mobile_contact_customer.json` | The Mobile Contact Customer DocType. |
| `logicx_hr/doctype/mobile_contact_customer/mobile_contact_customer.py` | `validate_duplicate()`; `update_customer_name()`, the Customer hook; and the unique index in `on_doctype_update()`. |
| `hooks.py` | `doc_events` on Customer: `on_update` and `after_rename` call `update_customer_name()`. |
| `logicx_erp/mobile_validation.py` | `validate_mobile_number()`, shared with Address, Contact, Customer and Supplier. |
| `logicx_hr/workspace/logicx_hr_home/logicx_hr_home.json` | The Mobile Contact shortcut. |
| `workspace_sidebar/logicx_hr.json` | The Mobile Contact link, under Masters. |
