# Mobile Contact

Mobile numbers. **Mobile Contact** holds the number itself and is named after it.

| DocType | Module | Purpose |
|---------|--------|---------|
| **Mobile Contact** | LogicX HR | One row = one mobile number, named after the number. |
| **Enquiry** | LogicX HR | Its Mobile is a Mobile Contact. Its Customer is picked on its own (see Enquiry). |

Until 0.1.94, a **Mobile Contact Customer** DocType linked each number to its Customers, and an
Enquiry's Customer was fetched from one of them. It was removed in 0.1.94; see the CHANGELOG.

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

## Enquiry

An Enquiry names its caller with two fields:

| Field | Label | Type | Notes |
|-------|-------|------|-------|
| `mobile` | Mobile | Link -> Mobile Contact, reqd | Holds the bare number, as it did when it was a Data field. In standard filters. |
| `customer` | Customer | Link -> Customer | Optional, and in the quick entry. In list view and standard filters. |

Mobile is a Link, so a number must exist as a Mobile Contact before an Enquiry can use it, and
the Mobile Contact's own check holds it to 10 digits. In the form, a number with no Mobile Contact
can be created from the Mobile field's dropdown. An API client creates it first, with a POST to
`Mobile Contact`.

Customer is not tied to Mobile: any Customer can be picked for any number, and an API client
sends `customer` alone:

```json
{ "mobile": "9876543210", "customer": "CUST-0001", "title": "..." }
```

### Patch

`set_enquiry_mobile_customer` runs in `post_model_sync`, after the sync has created the Mobile
Contact table. It backs the existing Enquiries' Mobiles:

| Step | What it does |
|------|--------------|
| 1 | Trims `mobile`, which a Link has to match exactly. |
| 2 | Creates a Mobile Contact for each Enquiry Mobile without one. |

Step 2 inserts documents, so the 10-digit check runs. A Mobile that fails it gets no Mobile
Contact. The patch prints it and carries on, and that number's Enquiries can't be saved until
their Mobile is corrected. Step 1 is a plain UPDATE, so the Enquiries' `modified` and version
history are left alone.

It prints how many Mobile Contacts it created and which numbers failed. Anything that already
exists is skipped, so running it again is safe. It is named for the Mobile Customer field it also
filled until 0.1.94.

## Permissions

- **TM User:** read, create, write, select, report, export, email, print and share. No delete, no
  import.
- **TM Admin:** full rights, including delete and import, plus permlevel 1.

## Deleting

Frappe's link check refuses to delete a Mobile Contact while an Enquiry or a Job Comments links to
it. A TM Admin deletes or relinks those records first.

## Where it shows

- **LogicX HR Home** workspace: a Mobile Contact shortcut.
- **LogicX HR** sidebar: Mobile Contact, under Masters.

## Limitations

- **Separate from other mobile numbers.** Mobile Contact doesn't read or update `Customer.mobile_no`
  or Contact phone numbers, and nothing creates Mobile Contacts from them.
- **No record of a number's Customers.** Each Enquiry carries its own Customer; nothing checks it
  against the Customers of the number's other Enquiries.

## Files

| File | What |
|------|------|
| `logicx_hr/doctype/mobile_contact/mobile_contact.json` | The Mobile Contact DocType. |
| `logicx_hr/doctype/mobile_contact/mobile_contact.py` | Trims and checks the number on save (`validate`) and on a forced rename from code (`before_rename`). |
| `logicx_hr/doctype/mobile_contact/mobile_contact.js` | Trims the number as it is typed. |
| `logicx_erp/mobile_validation.py` | `validate_mobile_number()`, shared with Address, Contact, Customer and Supplier. |
| `logicx_hr/workspace/logicx_hr_home/logicx_hr_home.json` | The Mobile Contact shortcut. |
| `workspace_sidebar/logicx_hr.json` | The Mobile Contact link, under Masters. |
| `logicx_hr/doctype/enquiry/enquiry.json` | `mobile` and `customer`. |
| `patches/set_enquiry_mobile_customer.py` | Backs the existing Enquiries' Mobiles with Mobile Contacts. |
| `patches.txt` | The patch, under `post_model_sync`. |
