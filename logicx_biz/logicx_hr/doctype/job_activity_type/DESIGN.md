# Job Activity Type

What posted a Job Activity. Job Activity is a job's timeline: Job Comments, Job Execution, Job
Location, Job Estimate and Job Attachment each post a row to it when they are saved. Every row names
its job through **Job Type** + **Job ID** (see [../job_type/DESIGN.md](../job_type/DESIGN.md)), and
the record that posted it through two more fields: **Job Activity Type**, which says what kind of
record it is, and **Job Activity ID**, the record itself.

| DocType | Module | Purpose |
|---------|--------|---------|
| **Job Activity Type** | LogicX HR | One row = one kind of record that posts Job Activity, named after the DocType it stands for. |
| **Job Activity** | LogicX HR | One row = one entry in a job's timeline: the job, the record that posted it, and the text. |
| **Job Comments**, **Job Execution**, **Job Location**, **Job Estimate**, **Job Attachment** | LogicX HR | Post a Job Activity row against their job, through `add_job_activity()`. |

## How it works

```
Job Activity JOBACT31
   job_type          = "Enquiry"        ------> Job Type "Enquiry"
   job_id            = "ENQ109"         ------> Enquiry "ENQ109"                   (the job)
   job_activity_type = "Job Execution"  ------> Job Activity Type "Job Execution"
   job_activity_id   = "JOBEXE7"        ------> Job Execution "JOBEXE7"            (what posted it)
```

`job_activity_id` is a Frappe **Dynamic Link** whose `options` is `job_activity_type`, the same way
`job_id` reads its DocType from `job_type`. A Job Activity Type's name must therefore be an exact
DocType name, which is why it is named after its `document_type` field, a Link to DocType. On save,
Frappe checks that `job_activity_id` exists in the DocType named by `job_activity_type`.

## Job Activity Type

Naming: `field:document_type`, so the name is the DocType's name, e.g. `Job Comments`. Rename is off:
a renamed Job Activity Type would no longer match its DocType.

| Field | Label | Type | Notes |
|-------|-------|------|-------|
| `document_type` | Document Type | Link -> DocType, reqd, unique | The DocType that a Job Activity ID of this type points at. |

Sort: `idx` descending, like Job Type. The list view follows it, so the seeded types keep the order
below. Job Activity Types added through the UI get idx 0 and sort last.

Permissions, as on Job Type:

- **TM User:** read, select, report, export, email and print.
- **TM Admin:** full rights, plus permlevel 1.

### Default Job Activity Types

Seeded by the `create_job_activity_types` patch, in this order. Each one's controller posts a Job
Activity from `on_update` when one of its trigger fields changes:

| Job Activity Type | Job Activity ID looks like | Posts when | Activity Details |
|-------------------|----------------------------|------------|------------------|
| Job Comments | `JOBCOM5` | `job_type`, `job_id` or `comment` changes | The comment, as written |
| Job Execution | `JOBEXE7` | `status` changes to Running, Completed or Cancelled | "Job Started / Stopped / Cancelled by {employee} at {date} {time}" |
| Job Location | `JOBLOC3` | `job_type`, `job_id`, `latitude` or `longitude` changes | "Location captured by {employee} at {date} {time}: {url}" |
| Job Estimate | `ESTIMATE4` | `item_name`, `supplier` or `date` changes | "Estimate for {item} is received from {supplier} on {date}" |
| Job Attachment | `JOBATT2` | `job_type`, `job_id` or `document` changes, and `document` is set | "Photo / Document attached by {employee} at {date} {time}: {url}" |

On insert, Frappe treats every field as changed, so every new record posts its row. Each later save
that changes a trigger field posts another one.

All five are LogicX HR doctypes, so the patch has no type to skip.

## The Job Activity fields

Naming: `JOBACT.#`. Title: `job_id`. Sort: `creation` descending, newest first.

| Field | Label | Type | Notes |
|-------|-------|------|-------|
| `job_type` | Job Type | Link -> Job Type, reqd | The job's kind, as on the job doctypes (see [../job_type/DESIGN.md](../job_type/DESIGN.md)). In list view and standard filters. |
| `job_id` | Job ID | Dynamic Link (`options: job_type`), reqd | The job. In list view and standard filters. |
| `job_activity_type` | Job Activity Type | Link -> Job Activity Type, read-only, no copy | The kind of record that posted the row. In list view and standard filters. |
| `job_activity_id` | Job Activity ID | Dynamic Link (`options: job_activity_type`), read-only, no copy | The record that posted the row. In standard filters. |
| `activity_details` | Activity Details | Text Editor | The text. In list view. |

`job_activity_type` and `job_activity_id` are optional. A Job Activity entered by hand has no
source, and Frappe hides the two read-only fields while they are empty. "No copy" keeps a duplicated
row from claiming the original's source.

Permissions:

- **TM User:** read, create, write, select, report, export, email, print and share. No delete.
- **TM Admin:** full rights, plus permlevel 1.

## Posting

`add_job_activity(job_type, job_id, activity_details, job_activity_type, job_activity_id)` in
`job_activity.py` inserts the row, ignoring permissions. Each of the five doctypes calls it from its
`post_job_activity()`, passing its own `job_type` / `job_id` and then `self.doctype` / `self.name`:

```python
add_job_activity(self.job_type, self.job_id, activity_details, self.doctype, self.name)
```

It posts nothing while `job_type`, `job_id` or `activity_details` is empty.

Renaming a source record keeps its rows pointing at it, as Frappe's rename also updates Dynamic
Links.

## Deleting a source record

Frappe's link check on delete follows Dynamic Links too. A Job Comments, Job Execution, Job
Location, Job Estimate or Job Attachment that has posted activity can't be deleted while its Job
Activity rows exist: "Cannot delete or cancel because Job Execution JOBEXE7 is linked with Job
Activity JOBACT31". A TM Admin deletes those rows first.

Adding `"Job Activity"` to `ignore_links_on_delete` in `hooks.py` would lift the check, for
`job_id` as well as `job_activity_id`.

## Adding a Job Activity Type

1. As TM Admin, create a Job Activity Type and pick the DocType as Document Type.
2. In that DocType's controller, build the text and call `add_job_activity()` from `on_update`,
   passing the job and `self.doctype` / `self.name`.

The two fields are read-only, so there is no `link_filters` list to extend. `create_job_activity_types`
runs once per site, so a type that every site needs is seeded by a patch of its own.

## Patches

Both run in `post_model_sync`, after the sync has created `tabJob Activity Type` and
`tabJob Activity`, and after `set_job_type_and_id_from_enquiry`, so the Job Comments rows they copy
have a Job Type and Job ID.

| Patch | What it does | Run again |
|-------|--------------|-----------|
| `create_job_activity_types` | Inserts the five default Job Activity Types with idx 5 to 1. | Skips types that already exist. |
| `copy_job_comments_to_job_activity` | Copies every Job Comments row that has text (comments, replies and auto-generated rows) to a new Job Activity with the same Job Type, Job ID and text, Job Activity Type `Job Comments` and Job Activity ID the row's name. It keeps the row's owner and timestamps. The Job Comments rows stay. | Skips rows whose copy (same Job Type, Job ID and creation time) already exists. |

The copy inserts with `db_insert()`, so no validation or hooks run and nothing new is posted. It
goes oldest first, so the `JOBACT.#` numbers follow the timeline. It prints how many rows it copied,
how many it skipped and how many had no job.

## Files

| File | What |
|------|------|
| `logicx_hr/doctype/job_activity_type/job_activity_type.json` | The Job Activity Type DocType. |
| `logicx_hr/doctype/job_activity_type/job_activity_type.py` | Controller (no logic). |
| `logicx_hr/doctype/job_activity/job_activity.json` | The Job Activity DocType. |
| `logicx_hr/doctype/job_activity/job_activity.py` | `add_job_activity()`. |
| `logicx_hr/doctype/job_{attachment,comments,estimate,execution,location}/*.py` | `post_job_activity()`: build the text and call `add_job_activity()`. |
| `patches/create_job_activity_types.py` | Seeds the default Job Activity Types. |
| `patches/copy_job_comments_to_job_activity.py` | Copies the Job Comments rows to Job Activity. |
| `patches.txt` | Both patches, under `post_model_sync`. |
