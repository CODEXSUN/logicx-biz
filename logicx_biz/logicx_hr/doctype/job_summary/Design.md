### * Original Prompt *
```
add new doctype 'Job Summary':
fields: "Job Type" | "Job ID" | comment_count | activity_count | execution_completed_count | execution_running_count |
unique: "Job Type" + "Job ID"

* No manual/user insertion
* On comment inserted & deleted update comment_count
* On activity inserted & deleted update activity_count
* On execution inserted & deleted update execution_completed_count where Status=Completed & execution_running_count  where Status=Running
* if there is no exisiting summary doc, insert one.
* patch for existing comment + activity + execution
```

### * Notes *

- **Counts are recounted, not added to.** Each event recounts its doctype's rows on the job
  (`job_summary.update_job_summary`), so two changes that are neither an insert nor a delete
  come out right too: a Job Execution going from Running to Completed or Cancelled (Stop and
  Cancel are saves), and a row whose Job Type or Job ID is changed, which recounts both jobs.
- **Hooks**: `on_update` (after insert and after each save, when Job Type, Job ID or, for Job
  Execution, Status changed) and `after_delete` (after the row is gone) on Job Comments, Job
  Activity and Job Execution.
- **Inserted** when a job gets its first row, **deleted** when all four counts come to 0.
- A Job Comments row on a Mobile alone has no job, and is not counted.
- **No role may create, edit or delete** a Job Summary. It is listed in
  `ignore_links_on_delete` (hooks.py), so it never holds up deleting the job.
- **Patch** `fill_job_summaries` (post_model_sync) recounts every job, and is safe to run again.

### * Limitations *

- **Renaming a job with Merge** (e.g. merging one Customer into another) fails on the unique
  index when both have a Job Summary: Frappe moves the old one's Job ID onto the new name.
- **Rows written around the controller** (`db_insert`, `frappe.db.delete`, `db_set` on Status)
  are not counted until the next event on that job recounts its doctype.
