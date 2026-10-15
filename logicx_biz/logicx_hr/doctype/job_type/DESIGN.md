# Job Type

What a job record belongs to. Job Attachment, Job Comments, Job Estimate, Job Execution and Job
Location used to belong to an Enquiry only. Each now names its job through two fields: **Job Type**,
which says what kind of record the job is (an Enquiry, a Task, a Customer, ...), and **Job ID**, the
record itself.

**Status: built, not yet run on a site.**

| DocType | Module | Change |
|---------|--------|--------|
| **Job Type** | LogicX HR | New. One row = one kind of job, named after the DocType it stands for. |
| **Job Attachment**, **Job Comments**, **Job Estimate**, **Job Execution**, **Job Location** | LogicX HR | New fields `job_type` and `job_id`. The old `enquiry` field stays for now, as optional and read-only. |
| **Enquiry** | LogicX HR | Its Connections (`links` -> Job Comments by `enquiry`) are removed for now. |

## How it works

```
Job Execution JOBEXE7
   job_type = "SOP Item"  ------> Job Type "SOP Item"     (a master row, named after DocType "SOP Item")
   job_id   = "SOP-12"    ------> SOP Item "SOP-12"       (Dynamic Link: its DocType is the value of job_type)

Job Execution JOBEXE8
   job_type = "Enquiry"   ------> Job Type "Enquiry"
   job_id   = "ENQ109"    ------> Enquiry "ENQ109"
```

`job_id` is a Frappe **Dynamic Link** whose `options` is `job_type`: Frappe reads the value of
`job_type` as the DocType of `job_id`. A Job Type's name must therefore be an exact DocType name,
which is why it is named after its `document_type` field, a Link to DocType. A Job Type whose name is
not a DocType would make every `job_id` against it fail Frappe's link check.

On save, Frappe checks that `job_id` exists in the DocType named by `job_type`. When `job_type` is
empty and `job_id` is set, it fails with "Job Type must be set first".

## Job Type

Naming: `field:document_type`, so the name is the DocType's name, e.g. `Enquiry`, `SOP Item`. Rename
is off: a renamed Job Type would no longer match its DocType.

| Field | Label | Type | Notes |
|-------|-------|------|-------|
| `document_type` | Document Type | Link -> DocType, reqd, unique | The DocType that a Job ID of this type points at. |

Sort: `idx` descending, like Enquiry Status. The link-field dropdown and the list view follow it, so
the seeded types keep the order below. Job Types added through the UI get idx 0 and sort last.

Permissions:

- **TM User:** read, select, report, export, email and print. TM Users pick Job Types but don't
  create or change them.
- **TM Admin:** full rights, plus permlevel 1.

### Default Job Types

Seeded by the `create_job_types` patch, in this order:

| Job Type | DocType from | Job ID looks like |
|----------|--------------|-------------------|
| Enquiry | LogicX HR | `ENQ109` |
| SOP Item | LogicX HR | `SOP-12` |
| Task | ERPNext (Projects) | `TASK-2026-00012` |
| Customer | ERPNext (Selling) | the customer's name / ID |
| Supplier | ERPNext (Buying) | `S1227` |

A type whose DocType is missing on the site is skipped with a printed note rather than failing the
migrate.

## The job fields

The same three fields on all five doctypes:

| Field | Label | Type | Notes |
|-------|-------|------|-------|
| `job_type` | Job Type | Link -> Job Type, reqd | `link_filters` limits the picker to the five default types. `remember_last_selected_value`: a new form starts with the type picked last. In list view and standard filters. |
| `job_id` | Job ID | Dynamic Link (`options: job_type`), reqd | In list view and standard filters. |
| `enquiry` | Enquiry | Link -> Enquiry, read-only | **Legacy, to be removed.** No longer mandatory, and gone from the list view and standard filters. Only rows that existed before the migration have it, so it stays empty, and hidden, on new rows. |

The two new fields take the place of `enquiry`: first on four of the doctypes, and second on Job
Execution, after `date`.

**Title:** `title_field` is now `job_id` on Job Attachment, Job Comments, Job Execution and Job Location,
so a link to one of them shows its Job ID. Job Estimate keeps `item_name`.

### Auto-comments

The four activity doctypes still post an auto-generated Job Comments row. It now goes against the
same `job_type` / `job_id`, through `add_job_comments(job_type, job_id, comment)` in `enquiry.py`.
Nothing is posted while `job_id` is empty.

| DocType | Posts when | Comment |
|---------|-----------|---------|
| Job Execution | `status` changes | "Job Started / Stopped / Cancelled by {employee} at {date} {time}" |
| Job Location | `job_type`, `job_id`, `latitude` or `longitude` changes | "Location captured by {employee} at {date} {time}: {url}" |
| Job Attachment | `job_type`, `job_id` or `document` changes | "Photo / Document attached by {employee} at {date} {time}: {url}" |
| Job Estimate | `item_name`, `supplier` or `date` changes | "Estimate for {item} is received from {supplier} on {date}" |

On insert, Frappe treats every field as changed, so every new record posts its comment.

### WhatsApp button (Job Comments)

The button looks up the mobile number on the Enquiry when Job Type is `Enquiry`. For any other type,
it opens WhatsApp with the comment and no number, and the user picks the contact.

## API

Clients send and filter by `job_type` + `job_id` (see the `Frappe.Api.*.rest` files next to each
doctype):

```json
{ "job_type": "Enquiry", "job_id": "ENQ109", "employee": "HR-EMP-00003", "start_time": "16:06:00" }
```

```json
"filters": [ [ "job_type", "=", "Enquiry" ], [ "job_id", "=", "ENQ109" ] ]
```

A client that still sends only `enquiry` now fails with "Missing mandatory: Job Type, Job ID".
Nothing copies `enquiry` into the new fields.

## Migration

Two patches run in `post_model_sync`, after the sync has created `tabJob Type` and added the
`job_type` / `job_id` columns. They come after `migrate_enquiry_messages_to_job_comments`, so the
Job Comments rows that patch copies are filled too.

| Patch | What it does | Run again |
|-------|--------------|-----------|
| `create_job_types` | Inserts the five default Job Types with idx 5 to 1. | Skips types that already exist. |
| `set_job_type_and_id_from_enquiry` | On each of the five doctypes: `UPDATE ... SET job_type = 'Enquiry', job_id = enquiry` where `enquiry` is set and `job_id` is empty. | Skips rows that already have a Job ID. |

The backfill is a plain SQL UPDATE, so `modified` and the version history are untouched. It prints,
per doctype, how many rows it filled and how many are still without a job. The second count should be
0, because `enquiry` was mandatory until this change.

## Adding a Job Type

1. As TM Admin, create a Job Type and pick the DocType as Document Type.
2. Add its name to the `link_filters` of `job_type` in all five doctype JSONs, then migrate. The filter
   repeats the master's list, so a new Job Type stays out of the picker until it is added there.

`link_filters` only narrows the picker in the form. It isn't checked on save, so the API accepts any
Job Type that exists.

## Not done yet

- **Remove the `enquiry` field** from the five doctypes. Nothing reads it any more: the controllers,
  the Job Comments form and the `.rest` samples all use `job_type` / `job_id`.
- **Restore Enquiry's Connections** on `job_id`. A `links` row can't add the `job_type = "Enquiry"`
  condition, so this needs an `enquiry_dashboard.py` with
  `"fieldname": "job_id"` and `"dynamic_links": {"job_id": ["Enquiry", "job_type"]}`. It can list all
  five job doctypes, not just Job Comments.
- **WhatsApp for Customer / Supplier** could fill the number from their `mobile_no`.
- **Changing Job Type in the form** doesn't clear `job_id`. The link check on save catches a
  mismatched pair.

## Files

| File | What |
|------|------|
| `logicx_hr/doctype/job_type/job_type.json` | The Job Type DocType. |
| `logicx_hr/doctype/job_type/job_type.py` | Controller (no logic). |
| `logicx_hr/doctype/job_{attachment,comments,estimate,execution,location}/*.json` | `job_type`, `job_id`; `enquiry` made optional and read-only; `title_field`. |
| `logicx_hr/doctype/job_{attachment,estimate,execution,location}/*.py` | Auto-comments against `job_type` / `job_id`. |
| `logicx_hr/doctype/job_comments/job_comments.js` | WhatsApp button reads the Enquiry from `job_id`. |
| `logicx_hr/doctype/enquiry/enquiry.py` | `add_job_comments(job_type, job_id, comment)`. |
| `logicx_hr/doctype/enquiry/enquiry.json` | `links` removed. |
| `logicx_hr/doctype/*/Frappe.Api.*.rest` | REST samples using `job_type` / `job_id`. |
| `patches/create_job_types.py` | Seeds the default Job Types. |
| `patches/set_job_type_and_id_from_enquiry.py` | Backfills `job_type` / `job_id` from `enquiry`. |
| `patches.txt` | The two patches, under `post_model_sync`. |
