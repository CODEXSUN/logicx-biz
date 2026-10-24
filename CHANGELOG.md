# Changelog

All notable changes to **logicx-biz** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

From 0.1.49 (2026-09-24) on, every build has its own version, `0.1.<build>`:
the build is the `#<n>` its commit messages start with, and commits that share
a number make one build, dated by its last commit. A version opens with
**Database Changes** when `bench migrate` changes tables, columns, indexes or
data for it: what the model sync does, and what each patch does.

## [0.1.95] - 2026-10-24

### Added

- **Customer Dashboard** page (`customer-dashboard`, `LogicX HR`; System
  Manager, TM Admin, TM User), in the LogicX HR sidebar after the Mobile
  Dashboard -- the Mobile Dashboard for one Customer instead of one number.
  The Customer is its only filter, picked in a link field and kept in the URL
  as `?customer=`; there is no Mobile Number filter. Five tabs, newest first
  and up to 500 each:
  - **Enquiries** whose Customer it is, with Mobile in place of the Customer
    column;
  - **Activity**, **Comments**, **Executions** and **Estimates** -- the rows
    posted on those Enquiries, together with the ones filed on the Customer
    itself (Job Type Customer), whose Enquiry column is blank.

  The comment box files its comments on the Customer (Job Type Customer, Job
  ID the Customer), which also posts a Job Activity there. The Mobile
  Dashboard's **WhatsApp** button sends to the Customer's Mobile No when it is
  10 digits, and saves the message as a comment on the Customer. A Customer
  with no Enquiry is offered **New Enquiry for {Customer Name}**, as the "..."
  menu's New Enquiry offers at any time: the Customer's Mobile No is made a
  Mobile Contact first, and the quick entry opens with Customer and Mobile
  filled in. A click on a row opens its document. Read with the user's own
  permissions.

### Changed

- **Comment cards on the Mobile and Customer Dashboards** are headed
  `24-10-2026 18:35  ◦  Ashok Kumar  ◦  Enquiry: Q930` -- when, to the minute,
  who, and the job the comment is on, by its Job Type and Job ID. The header
  stops at who for a comment made on a number alone, which has no job, and on
  the Customer Dashboard for one filed on the Customer itself -- the Customer
  the page is about. It used to read `{when} - {who}:`.

## [0.1.94] - 2026-10-24

### Database Changes

- **Enquiry's `mobile_customer` field removed.** The sync takes it off the
  DocType; the column stays in `tabEnquiry`, values and all, unused.
- **DocType Mobile Contact Customer deleted** -- its files are gone, so
  migrate's "Removing orphan doctypes" step deletes its DocType record, with
  its fields and permissions. `tabMobile Contact Customer` and its rows stay in
  the database, as Frappe never drops a table there. `bench --site <site>
  trim-database` removes the table, and `trim-tables` the `mobile_customer`
  column; both take `--dry-run` to list what they would drop.
- No new patch. `set_enquiry_mobile_customer` (0.1.76) loses its Mobile Contact
  Customer steps and now only trims Mobile and creates Mobile Contacts. It
  does not run again where it has run already.

### Changed

- **Enquiry: Customer is picked directly** -- an editable Link to Customer, no
  longer read-only or fetched, and offered in the quick entry where Mobile
  Customer was. It is not tied to the Mobile: any Customer can go with any
  number. The checks that held Mobile Customer to the Mobile, and Customer to
  Mobile Customer, are gone, so imports and the API send `customer` alone.
  Existing Customers are left as they are.

### Removed

- **Mobile Contact Customer DocType** (from 0.1.75), with the Mobile Contact
  form's **Customers** button and the Customer `on_update` / `after_rename`
  hooks that kept its Customer Name in step.
- **Enquiry: Mobile Customer** field (from 0.1.76), and the filter the Mobile
  Dashboard put on it in the Enquiry quick entry.

## [0.1.93] - 2026-10-23

### Database Changes

- **Patch `create_enquiry_status_duplicate`** (post_model_sync) -- inserts the
  Enquiry Status **Duplicate** in Status Group **Closed**, at idx 0 so it sorts
  after the seeded statuses. A no-op where it exists already.

### Added

- **Duplicate Enquiry Status** -- for an Enquiry that repeats one already
  logged. Being in the Closed group, it is left out of the Member Dashboard
  until "Show Closed" is ticked, and the status reports count it under Closed.
  Also added, last, to the defaults in `create_enquiry_statuses`.

## [0.1.92] - 2026-10-23

### Database Changes

- **Three DocTypes renamed, tables and all** -- patch `rename_sop_doctypes`
  (pre_model_sync) runs `frappe.rename_doc` on each before the sync:
  `tabSOP Item` → `tabSOP`, `tabSOP Assigned` → `tabDuty` and
  `tabSOP Reporting` → `tabDuty Reporting`. Link options, and the comments,
  versions, attachments and customizations recorded against them, follow.
  Document names (`SOP-12`, `ASSIGN7`, `REPORTING222`, ...) and the naming
  series are unchanged.
- **`sop` column replaces `sop_item`** (Link → SOP) on `tabDuty` and
  `tabDuty Reporting`. Patch `rename_sop_item_field_to_sop` (post_model_sync)
  copies the values over with `rename_field`, which also points saved
  reports, list view columns, user settings and property setters at `sop`.
  The old `sop_item` column stays in the table, unused.
- **Job Type "SOP Item" replaced by "Duty"**, at the same place in the picker
  (in `rename_sop_doctypes`). Where job rows still point at "SOP Item", it is
  renamed to "SOP", which keeps them on their SOP; otherwise it is deleted. The
  patch prints which it did. `create_job_types` now seeds Duty in its place.

### Changed

- **SOP Item is now SOP, SOP Assigned is now Duty, and SOP Reporting is now
  Duty Reporting** -- DocTypes, forms, LogicX HR Home shortcuts and sidebar
  links. Duty and Duty Reporting fetch SOP Name, Department, Frequency and
  Steps through the new `sop` field; the SOP and Duty forms' "SOP Reporting"
  button is now "Duty Reporting"; both lists keep their default filter on the
  logged-in user.
- The **Activity** button (0.1.88) moves from SOP Item to Duty, and the Job
  Type picker on the job DocTypes offers Duty instead of SOP Item.
- REST: Duty and Duty Reporting take and return `sop` instead of `sop_item`;
  the examples are now `Frappe.Api.DutyReporting.rest`.

## [0.1.91] - 2026-10-22

### Changed

- **Member Dashboard: column widths** -- each column keeps the width set for
  it, and only Title stretches to fill the rest of the card. Date is centred,
  and Customer, Created By and Assigned To are wider.

### Fixed

- **Member Dashboard: columns no longer turn right-aligned** when the top row
  has a blank in them (an Enquiry with no List in, a Lead not yet assigned).
  Every column is left-aligned unless set otherwise.

## [0.1.90] - 2026-10-22

### Database Changes

- **Enquiry naming: `ENQ.#` → `Q.#`.** Patch
  `carry_enquiry_number_to_q_series` (pre_model_sync) raises the `Q` counter in
  `tabSeries` to the highest number used so far -- the `ENQ` counter, the `Q`
  counter, or the number in any existing `ENQ<n>` / `Q<n>` name -- so
  numbering carries on: after ENQ57 comes Q58. Existing Enquiries keep their
  names, and the counter is only ever raised.

### Added

- **Member Dashboard** page (`member-dashboard`, `LogicX HR`; System Manager,
  TM Admin, TM User), in the LogicX HR sidebar after the Mobile Dashboard --
  the Enquiries of the member looking at it, as the Employee linked to their
  User, in two tabs: **Jobs**, the ones assigned to them, and **Leads**, the
  ones they created. Newest first, up to 500 a tab, with Q#, Date, Title,
  Customer, List in, Created By / Assigned To and Status. Enquiries whose
  Status is in the Closed group stay out until the tab's "Show Closed Jobs" /
  "Show Closed Leads" box is ticked. A click on a row opens the Mobile
  Dashboard on that Enquiry's mobile number. Read with the user's own
  permissions.

### Changed

- **Enquiries are named `Q.#`** (Q58, Q59, ...) instead of `ENQ.#`.
- **Enquiry Details is no longer mandatory** on Enquiry.

## [0.1.89] - 2026-10-22

### Database Changes

- **`tabEnquiry.title` widened to 250 characters** (from the default 140) and
  made mandatory. Patch `set_enquiry_title_from_details` (post_model_sync)
  fills each empty Title from the Enquiry Details, as one line of plain text
  cut to 250 characters; an Enquiry whose Details are empty too is left, and
  printed.
- **Enquiry Status made mandatory.** Patch `set_empty_enquiry_status_to_new`
  (post_model_sync) sets every empty Status to **New**, creating that Enquiry
  Status first should it have been deleted.
- Both patches leave `modified` and the version history alone, and are safe to
  run again.

### Changed

- **Enquiry: Title and Status are mandatory**, and Title takes up to 250
  characters.
- **Enquiry form** -- Company Name, Address, Due Date, Priority and Status
  Details are hidden, and Assigned To moves above Enquiry Details.

## [0.1.88] - 2026-10-21

### Added

- **Activity button on the Enquiry, SOP Item, Customer and Supplier forms** --
  a menu of Job Activity, Job Comments, Job Estimate, Job Execution, Job
  Location and Job Attachment, each opening that list filtered on the record
  (Job Type = the form's DocType, Job ID = the record). Only the lists the user
  can read are offered, and an unsaved record gets no button. Loaded from
  `app_include_js` (`public/js/job_activity_menu.js`), as Customer and Supplier
  are ERPNext's forms.

## [0.1.87] - 2026-10-20

### Added

- **Mobile Dashboard: WhatsApp button** (green, just left of the "..." in the
  bar; enabled while the number is a Mobile Contact) -- opens a **WhatsApp to
  {number}** dialog with an optional **WhatsApp Template**, whose Message
  Template fills the box below for editing, and a mandatory **Message**.
  **Send** first saves the message as a Job Comments on the number, ending in a
  dulled "- Shared via WhatsApp -" line, then opens
  `whatsapp://send?phone=91{number}` with the message as written, without that
  line. A failed save keeps the dialog open; when the browser blocks the
  WhatsApp window, the page offers a link to open it instead. In its own folder
  (`page/mobile_dashboard/mobile_whatsapp/`), appended to the page through the
  `page_js` hook.
- WhatsApp Template's Message Template field lists WhatsApp's formatting marks
  (`*bold*`, `_italic_`, `~strikethrough~`).

## [0.1.86] - 2026-10-20

### Database Changes

- **New table `tabWhatsApp Template`** -- `title` (Data, unique; also the
  document name) and `message_template` (Text).

### Added

- **WhatsApp Template DocType** (`LogicX HR`) -- a ready message to start a
  WhatsApp from: a unique, mandatory `Title`, which names it, and a mandatory
  `Message Template`. Ordered by `idx` (descending). `TM User` can read and pick
  them; `TM Admin` has full rights plus permlevel 1.

## [0.1.85] - 2026-10-20

### Added

- **Mobile Dashboard: Comments tab** -- the Job Comments carrying the number as
  their Mobile, newest first, as cards: who and when on top, the comment
  beneath, line for line. A comment box above them (shown while the number is
  a Mobile Contact) posts a new comment on the number itself, with no job;
  Ctrl+Enter (Cmd+Enter) posts too, and the box clears once the save succeeds.

### Changed

- **A Job Comments can be on a mobile number alone.** Job Type and Job ID are
  no longer mandatory: a comment has both (a comment on a job) or neither, and
  then needs a Mobile, entered by hand. `validate_job_or_mobile` holds every
  save to this, and the form marks the fields to match. A comment on a number
  alone posts no Job Activity. Over REST, `{"mobile": ..., "comment": ...}` is
  accepted.
- **Job Comments' WhatsApp button** sends to the comment's own Mobile.

## [0.1.84] - 2026-10-20

### Database Changes

- **New `mobile` column on `tabJob Comments`** (Link → Mobile Contact). Patch
  `set_job_comments_mobile_from_enquiry` (post_model_sync) copies the Enquiry's
  Mobile onto the existing comments with Job Type "Enquiry" -- only where that
  Mobile is a Mobile Contact, so no link is left broken. Plain UPDATE; rows
  that have a Mobile are skipped.

### Added

- **Job Comments: Mobile** (read-only) -- for a comment on an Enquiry, the
  Enquiry's Mobile, set on every save and shown as soon as the job is picked;
  empty for other Job Types.

## [0.1.83] - 2026-10-20

### Added

- **Mobile Dashboard: "New Enquiry for {number}"** -- a button under the "No
  Mobile Contact found for {number}" message. It makes the number a Mobile
  Contact (`ensure_mobile_contact`, POST, held to Mobile Contact's create
  permission; one made since is used as it is), then opens the Enquiry quick
  entry on it. Once saved, the page shows the number with its new Enquiry.

### Changed

- The "..." menu's **New Enquiry** opens the quick entry too, on the number on
  screen when it is a Mobile Contact.

## [0.1.82] - 2026-10-20

### Database Changes

- **Page `enquiry-dashboard` replaced by `mobile-dashboard`** -- the sync
  creates the new Page record, and patch `delete_enquiry_dashboard_page`
  (post_model_sync) deletes the stale one.

### Changed

- **The Enquiry Dashboard is now the Mobile Dashboard** -- page
  `mobile-dashboard` (was `enquiry-dashboard`), with its sidebar link renamed.
  Its server side moves from `logicx_hr/enquiry_dashboard.py` to
  `logicx_hr/mobile_dashboard.py`, so the method is now
  `logicx_biz.logicx_hr.mobile_dashboard.get_dashboard`.

## [0.1.81] - 2026-10-20

### Added

- **Clear Filters and Refresh buttons** on the Enquiry Dashboard and the Party
  Dashboard. Clear Filters empties the number or party and puts the cards' own
  filters back as they opened (the Party Dashboard keeps its party type);
  Refresh asks for what is on screen again.

### Changed

- The round **"+"** menu on both dashboards is now a **"..."** (Actions) menu,
  with the same entries, and everything on the bar sits centred on one line.

## [0.1.80] - 2026-10-20

### Fixed

- **Column widths are honoured** on the Party Dashboard cards and the Enquiry
  Dashboard tabs. frappe-datatable's "fluid" layout threw the widths away and
  shared the room out equally; the tables are now "fixed", with the widths
  stretched in proportion to fill the card -- never shrunk, so a wider table
  scrolls sideways.

## [0.1.79] - 2026-10-20

### Added

- **Enquiry Dashboard** page (`enquiry-dashboard`, `LogicX HR`; System Manager,
  TM Admin, TM User), first in the LogicX HR sidebar after Home -- look up a
  10-digit mobile number. A mark beside the box says whether it is a Mobile
  Contact; when it is, tabs list its **Enquiries** and the **Activity**,
  **Executions** and **Estimates** posted against them, newest first, up to 500
  a tab. A click on a row opens its record; an Activity row opens the record
  that posted it. The `+` menu opens a **New Enquiry** on the number. The
  number is kept in the URL, so a refresh or the Back button keeps it. Read
  with the user's own permissions (`logicx_hr/enquiry_dashboard.py`,
  `get_dashboard`).

## [0.1.78] - 2026-10-20

### Changed

- **Enquiry: Quick Entry enabled** -- a new Enquiry can be made from the quick
  entry dialog, with Mobile, Mobile Customer, Title, Enquiry Details, List in
  and Assigned To.

## [0.1.77] - 2026-10-16

### Database Changes

- **New table `tabEnquiry Closure Request`** -- `enquiry` (Link → Enquiry),
  `requested_by` (Link → Employee), `requested_at` (Datetime), `status`
  (Select: Pending / Approved / Rejected, default Pending), `request_note`,
  `reviewed_by` (Link → Employee), `reviewed_at` (Datetime) and `review_note`.

### Added

- **Enquiry Closure Request DocType** (`LogicX HR`) -- a request to close an
  Enquiry, and its review: Enquiry, Requested By and Requested At (all
  mandatory), Status, Request Note, and Reviewed By / Reviewed At / Review
  Note. Named `ENQCLOSE.#`. `TM User` read/create/write, `TM Admin` full plus
  permlevel 1. No logic of its own yet.

## [0.1.76] - 2026-10-16

### Database Changes

- **`tabEnquiry`: new `mobile_customer` column** (Link → Mobile Contact
  Customer). `mobile` changes from Data (Phone) to a Link to Mobile Contact,
  still varchar(140), and `customer` is now read-only, fetched from
  `mobile_customer.customer`.
- **Patch `set_enquiry_mobile_customer`** (post_model_sync), for the existing
  Enquiries: trims Mobile; creates a Mobile Contact for each Mobile that has
  none (a number failing the 10-digit check is printed, and its Enquiries left
  for someone to correct); creates a Mobile Contact Customer for each Mobile +
  Customer pair that has none; and sets Mobile Customer on each Enquiry with a
  Customer. Enquiries are updated with plain UPDATEs, so `modified` and the
  version history are left alone. Safe to run again.

### Changed

- **Enquiry: Mobile is a Link to Mobile Contact, and Customer comes from the
  new Mobile Customer** -- pick the Mobile, then one of its Mobile Contact
  Customers (the picker lists only that number's), and Customer fills from it.
  Changing the Mobile clears Mobile Customer, and clearing Mobile Customer
  clears Customer. On save, Mobile Customer must belong to the Mobile, and
  Customer must be its Customer, or empty without one. The 10-digit check now
  lives in Mobile Contact.

## [0.1.75] - 2026-10-16

### Database Changes

- **New table `tabMobile Contact`** -- `mobile_number` (Data, unique; also the
  document name).
- **New table `tabMobile Contact Customer`** -- `mobile_contact` (Link → Mobile
  Contact), `customer` (Link → Customer) and `customer_name` (Data, fetched),
  with a unique index on (`mobile_contact`, `customer`).

### Added

- **Mobile Contact DocType** (`LogicX HR`) -- one row per mobile number, named
  after it. The number is trimmed and held to exactly 10 digits on save and on
  rename. A **Customers** button lists its Mobile Contact Customers.
- **Mobile Contact Customer DocType** (`LogicX HR`) -- links one Mobile Contact
  to one Customer, once per pair. Named `{mobile_contact} - {customer}` and
  titled by Customer Name, which `doc_events` on Customer (`on_update`,
  `after_rename`) keep in step with the Customer.
- Both: `TM User` read/create/write, `TM Admin` full plus permlevel 1. A
  **Mobile Contact** shortcut on the LogicX HR Home workspace, and a link in
  the sidebar's Masters section.

## [0.1.74] - 2026-10-16

### Database Changes

- **New table `tabJob Activity Type`** -- `document_type` (Link → DocType,
  unique; also the document name).
- **New `tabJob Activity` columns** `job_activity_type` (Link → Job Activity
  Type) and `job_activity_id` (Dynamic Link on it), both read-only.
- **Patch `create_job_activity_types`** (post_model_sync) -- seeds Job
  Comments, Job Execution, Job Location, Job Estimate and Job Attachment, in
  that order.
- **Patch `copy_job_comments_to_job_activity`** (post_model_sync) -- copies
  every non-empty Job Comments row into Job Activity with the same Job Type,
  Job ID, text, owner and timestamps, pointing back at its row (Job Activity
  Type "Job Comments", Job Activity ID its name). Oldest first, so the
  `JOBACT.#` numbers follow the timeline. The Job Comments rows stay as they
  are; copies that exist already are skipped.

### Added

- **Job Activity Type DocType** (`LogicX HR`) -- the kinds of record that post a
  Job Activity, each named after its DocType. `TM User` can read and pick them;
  `TM Admin` has full rights. A Job Activity names the record that posted it in
  **Job Activity Type** + **Job Activity ID**.

### Changed

- **Auto-posted rows go to Job Activity, not Job Comments** -- "Location
  captured by ...", "Photo attached by ..." and the like, from Job Execution,
  Job Location, Job Attachment and Job Estimate. A Job Comments save that
  changes its job or text posts the comment there too, so Job Activity is the
  job's whole timeline.

## [0.1.73] - 2026-10-15

### Database Changes

- **New table `tabJob Activity`** -- `job_type` (Link → Job Type), `job_id`
  (Dynamic Link on it) and `activity_details` (Text Editor).

### Added

- **Job Activity DocType** (`LogicX HR`) -- a line in a job's timeline: Job Type
  and Job ID (both mandatory) and Activity Details. Named `JOBACT.#`, titled by
  Job ID. `TM User` read/create/write, `TM Admin` full plus permlevel 1.

## [0.1.72] - 2026-10-15

### Database Changes

- **New table `tabJob Type`** -- `document_type` (Link → DocType, unique; also
  the document name).
- **New columns `job_type`** (Link → Job Type) **and `job_id`** (Dynamic Link on
  it) on `tabJob Attachment`, `tabJob Comments`, `tabJob Estimate`,
  `tabJob Execution` and `tabJob Location`. Their `enquiry` column stays, now
  optional and read-only.
- **Patch `create_job_types`** (post_model_sync) -- seeds Enquiry, SOP Item,
  Task, Customer and Supplier, in that order, skipping (with a note) any whose
  DocType is missing on the site.
- **Patch `set_job_type_and_id_from_enquiry`** (post_model_sync) -- gives every
  existing row on those five Job Type "Enquiry" and its Enquiry as Job ID.
  Plain UPDATE; rows that have a Job ID are skipped.

### Added

- **Job Type DocType** (`LogicX HR`) -- the kinds of record a job can be, each
  named after its DocType (`field:document_type`) and ordered by `idx`.
  `TM User` can read and pick them; `TM Admin` has full rights.

### Changed

- **Job Attachment, Job Comments, Job Estimate, Job Execution and Job Location
  belong to a job, not only to an Enquiry** -- through Job Type + Job ID (a
  Dynamic Link), both mandatory, with Job Type offering Enquiry, SOP Item,
  Task, Customer and Supplier. Job ID is now the title of all of them but Job
  Estimate. Auto-posted comments go to the job, and the Job Comments WhatsApp
  button looks up a mobile number only for an Enquiry.
- REST: requests send `job_type` / `job_id`; one that sends only `enquiry`
  fails with "Missing mandatory: Job Type, Job ID".

### Removed

- Enquiry's **Connections** to Job Comments (from 0.1.70), for now.

## [0.1.71] - 2026-10-14

### Changed

- Internal names follow the Job Comments DocType: `add_enquiry_message()` is
  now `add_job_comments()`, and each job DocType's `post_enquiry_message()` is
  `post_job_comments()`. No change in behaviour.

## [0.1.70] - 2026-10-14

### Database Changes

- **New table `tabJob Comments`** -- `enquiry` (Link → Enquiry), `comment`
  (Text Editor), `mode` (Select: Comment / Reply) and `parent_comment` (Link →
  Job Comments).
- **Enquiry's Messages table field (`enquiry_messages`) removed.** No column
  goes with it: its rows stay in `tabEnquiry Message`, and that DocType is kept
  until the copy is verified.
- **Patch `migrate_enquiry_messages_to_job_comments`** (post_model_sync) --
  copies each Enquiry Message row into Job Comments under the same name, so a
  reply's `parent_message` carries over as `parent_comment` and still points at
  the right comment; owner and timestamps carry over too. Rows copied already
  are skipped.

### Added

- **Job Comments DocType** (`LogicX HR`) -- an Enquiry's comments as records of
  their own: Enquiry (mandatory), Comment, Mode (Comment / Reply) and a hidden
  Parent Comment, with a **WhatsApp** button that opens WhatsApp on the
  Enquiry's mobile number with the comment. Named `JOBCOM.#`. `TM User`
  read/create/write, `TM Admin` full plus permlevel 1.
- Enquiry **Connections** to Job Comments.

### Changed

- **Auto-posted rows** from Job Execution, Job Location, Job Attachment and Job
  Estimate become Job Comments records instead of Enquiry Message rows.
- **Enquiry's title field is `title`** (was `enquiry_details`).
- REST examples read and add an Enquiry's comments through Job Comments.

### Removed

- **The Messages table on the Enquiry form**, with its row behaviour and
  per-message WhatsApp button.

## [0.1.69] - 2026-10-14

### Database Changes

- **DocType renamed, table and all** -- patch `rename_estimate_to_job_estimate`
  (pre_model_sync) runs `frappe.rename_doc` before the sync: `tabEstimate` →
  `tabJob Estimate`. Link options, and the comments, versions, attachments and
  customizations recorded against it, follow. Document names (`ESTIMATE1`,
  ...) and the naming series are unchanged.

### Changed

- **Estimate is now Job Estimate** -- DocType, LogicX HR Home shortcut, sidebar
  link and REST examples (`Frappe.Api.JobEstimate.rest`).

## [0.1.68] - 2026-10-08

### Database Changes

- **New `tabEnquiry` columns** `company_name` (Data) and `address` (Small
  Text).

### Added

- **Enquiry: Company Name and Address** fields.

## [0.1.67] - 2026-10-06

### Fixed

- **BRS Import reads dates the way an Indian bank writes them.** A sheet's Date
  can be a date cell, a plain number (Excel's serial date), or text written
  **day first** -- `04/02/26`, `4-2-2026`, `04.02.2026`, `04-Feb-2026`,
  `4 February 2026` -- or year first (`2026-02-04`), with any time after it
  dropped; each is posted as `YYYY-MM-DD`. Refused, naming the row: text that
  is not a day-first date (`02/13/26`, `31/02/26`), a date outside 2000 to
  2099, a column that mixes date cells and text (a sheet Excel reopened under
  another date setting), and a date earlier than the row above it.
- **`bulk_insert` takes `YYYY-MM-DD` and nothing else.** Frappe's own date
  parsing read `04/02/26` month first, as the 2nd of April, and turned to day
  first only past the 12th, so a day-first statement silently had every 1st to
  12th of a month swapped.

## [0.1.66] - 2026-10-06

### Changed

- **BRS Dashboard: Transaction is the first tab**, before Import.
- **BRS Dashboard: a tab that fails to build** shows the error in its own pane
  and leaves the rest of the page working; showing it again retries.

### Fixed

- **BRS Dashboard: the Transaction tab's filters** load Frappe's form controls
  (`controls.bundle.js`) themselves when the desk has not loaded them yet, as
  happened on v16 once the tab came first.
- **BRS Import shows the server's own failure** on a 500 -- the exception it
  names, rather than the status alone.

## [0.1.65] - 2026-10-06

### Database Changes

- **New module `LogicX Banking`.** Patch `move_brs_to_logicx_banking`
  (pre_model_sync) creates its Module Def and points the BRS Transaction and
  BRS Date DocTypes and the `brs-dashboard` Page at it before the sync, so
  migrate does not delete them as orphans. No table changes.

### Added

- **LogicX Banking module** -- a Home workspace (BRS Dashboard, BRS
  Transaction, BRS Date), a LogicX Banking sidebar, and a **Banking LogicX**
  desktop icon (System Manager, TM Admin, TM User).

### Changed

- **BRS Date, BRS Transaction and the BRS Dashboard move to LogicX Banking**
  (`logicx_biz/logicx_banking/`), and **their whitelisted methods' paths change
  with them**. API callers must switch to
  `logicx_biz.logicx_banking.doctype.brs_transaction.brs_transaction.bulk_insert`
  and
  `logicx_biz.logicx_banking.page.brs_dashboard.brs_import.brs_import.import_sheet`.

## [0.1.64] - 2026-10-05

### Added

- **BRS Dashboard: Transaction tab** (BRS Transaction Report) -- BRS
  Transactions as a table of Account, Date, Deposit, Withdraw, Reference Number
  and Description, oldest first (by date, account, then the bank's own order).
  Filters: Bank Account (the company's own bank accounts, disabled ones listed
  last and marked), Date, and a Search through Reference Number and
  Description. A click on a row opens the transaction (Ctrl/Cmd-click in a new
  tab). Up to 500 rows, the latest when there are more. Read-only, with the
  user's own permissions, and fetched each time the tab comes on screen.

## [0.1.63] - 2026-10-05

### Changed

- **The BRS Dashboard is a strip of tabs**, each in its own folder under the
  page and appended to it through a new `page_js` hook. BRS Import becomes its
  **Import** tab (`page/brs_dashboard/brs_import/`). A tab is built the first
  time it is shown.
- **`import_sheet` moves** from `logicx_biz.logicx_hr.brs_dashboard` to
  `logicx_biz.logicx_hr.page.brs_dashboard.brs_import.brs_import` (and again
  in 0.1.65).

## [0.1.62] - 2026-10-01

### Changed

- BRS Import code tidied: helpers used in one place became local functions. No
  change in behaviour.

## [0.1.61] - 2026-09-30

Includes the commit numbered `#561`, read as #61.

### Changed

- **BRS Import imports an `.xlsx` on the server** -- the page uploads the
  workbook to the new `import_sheet`, which reads it and hands the rows to
  `bulk_insert` there; the rows never travel to the browser, and the workbook
  is never saved. A `.json` file is still posted as its rows.
- **`bulk_insert` refusals say more.** When the last posted transaction is not
  in the data, the message lists the six values it was looked for by, and the
  closest row with the fields it is out on; when the backward walk disagrees,
  it shows what each side holds for the fields that differ.
- `MAX_BACKWARD_MATCHES_LIMIT` lowered from 10 000 to 3.

### Fixed

- **BRS Import: "File size exceeded the maximum allowed size"** for statements
  far below the limit. The desk reports every 413 that way, whichever limit was
  reached; here it was werkzeug's 500 kB cap on url-encoded form data, which
  `frappe.call` posts, met first by the file sent as base64 and then by the
  rows carried back and forth. The page no longer uses `frappe.call`: it sends
  a JSON body, or the file itself as multipart.

## [0.1.60] - 2026-09-29

### Added

- **BRS Date: Transactions table** -- the date's BRS Transactions below its
  amounts, in the order they were posted (ID linked to its form, Withdrawal,
  Deposit, Reference Number, Description), sortable and filterable in place.
  Read-only.

## [0.1.59] - 2026-09-29

### Added

- **BRS Dashboard** page (`brs-dashboard`, `LogicX HR`; System Manager, TM
  Admin, TM User) with **BRS Import** -- pick a bank statement, a `.json` of
  rows or an `.xlsx`, and its rows go to BRS Transaction's `bulk_insert`. The
  page then shows the Bank Account, the rows skipped as already posted (and how
  many were confirmed), the transactions posted now as links, and the account's
  last posted transaction before and after. An `.xlsx` is read from its first
  sheet, up to 5 MB, under a heading row of exactly `bank_account`, `date`,
  `description`, `reference_number`, `withdrawal`, `deposit` and
  `closing_balance`, in any order, case and spacing ignored; a column unknown,
  missing or given twice is refused. All or nothing: a refused row posts
  nothing, and a file imported twice posts nothing the second time.

### Changed

- **An account's opening BRS Date is its BRS Closing Date too**, until a later
  date follows it, so an account with an opening date always has a closing
  one. Accounts opened before keep an empty BRS Closing Date, which the code
  falls back from.
- `MAX_BACKWARD_MATCHES_LIMIT` raised from 100 to 10 000.

## [0.1.58] - 2026-09-29

### Changed

- API One's design notes (`API-One.MD`, `Apparel-Command-Poll.MD`) move from
  the repository root to `logicx_hr/doctype/api_one/`.

## [0.1.57] - 2026-09-29

### Added

- **Deleting a BRS Transaction** (`TM Admin`) -- only an account's last one, so
  the chain shrinks from its tail. The transaction before it loses its Next
  Transaction, and its BRS Date takes it out of the count, Withdrawal and
  Deposit and falls back to the previous Closing Transaction and Balance. A
  date left with no transaction is deleted along with it, and the account's
  BRS Closing Date moves back to the date before; deleting the opening date
  leaves the account with neither date. A BRS Date cannot be deleted by hand.

## [0.1.56] - 2026-09-29

### Database Changes

- **New `tabBRS Date` columns** `opening_balance`, `withdrawal`, `deposit` and
  `closing_balance` (Currency, read-only).

### Added

- **BRS Date amounts** -- Opening Balance (its first transaction's), Withdrawal
  and Deposit (summed over its transactions) and Closing Balance (its latest
  transaction's), kept up to date as each transaction is added.
- **`bulk_insert` API** (POST,
  `logicx_biz.logicx_hr.doctype.brs_transaction.brs_transaction.bulk_insert`)
  -- posts a bank statement for one Bank Account, oldest row first. The
  account's last posted transaction is found in the data, matched on Bank
  Account, Date, Reference Number, Withdrawal, Deposit and Closing Balance (not
  Description), and confirmed backwards against the chain -- at least 2 rows
  unless the walk reaches the opening transaction, at most 100. The rows up to
  it are skipped and the rest appended one by one as normal BRS Transactions,
  each opening at the Closing Balance before it. Nothing is inserted into the
  middle of a chain, and the call is one database transaction, so a refused
  row posts nothing. Needs create on BRS Transaction. Described in
  `Bulk-Insert.MD`, with REST examples.
- **The BRS Transaction form fills Previous Transaction and Opening Balance** as
  soon as a Bank Account is picked (`get_chain_tail`), or warns that the
  account has no opening balance yet.

## [0.1.55] - 2026-09-28

### Database Changes

- **New Role `TM Stores`**, from the Role fixture (`hooks.py` now exports it).

### Added

- **TM Stores role**, with access to the Stock Search Detailed, Vendor Stock and
  Vendor Stock Batch Wise reports.

## [0.1.54] - 2026-09-28

### Database Changes

- **New table `tabBRS Transaction`** -- `bank_account` (Link → Bank Account),
  `date`, `is_opening` (Check), `brs_date` (Link → BRS Date),
  `daily_roll_number` (Int), `description`, `reference_number`,
  `opening_balance`, `withdrawal`, `deposit`, `closing_balance` (Currency), and
  `previous_transaction` / `next_transaction` (Link → BRS Transaction).
- **New `tabBRS Date` columns** `opening_transaction` and
  `closing_transaction` (Link → BRS Transaction) and `no_of_transactions` (Int,
  default 0).

### Added

- **BRS Transaction DocType** (`LogicX HR`) -- one line of a bank statement:
  Bank Account, Date, Description, Reference Number, Opening Balance, a
  Withdrawal or a Deposit, and Closing Balance. An account's transactions form
  a chain through Previous / Next Transaction: the opening one first, entered
  by a `TM Admin` (Is Opening is permlevel 1), then each new one after the
  last. On insert, a transaction has a Deposit or a Withdrawal, not both and
  neither negative; Opening + Deposit − Withdrawal must equal Closing ("Balance
  is not matching."); Opening Balance must equal the previous Closing Balance;
  and the date cannot be earlier than the previous one's. An account with no
  opening transaction takes no other. Each joins the BRS Date of its date,
  which the first transaction on a date creates, and takes the next Daily Roll
  Number on it. Named `BRSTXN.#`. Updating and deleting are refused for now.
  `TM User` read/create/write, `TM Admin` full plus permlevel 1.

### Changed

- **A BRS Date is created by the first BRS Transaction on its date**, never by
  hand: `TM User` can only read BRS Dates now, and import is off. A date
  records its Opening and Closing Transaction and how many it has.

## [0.1.53] - 2026-09-26

### Added

- **BRS Date chain** -- a Bank Account's BRS Dates run on from its opening
  date, each later date after the one before it through Previous / Next BRS
  Date. On insert, an opening date has no previous one; any other needs one,
  of the same account, earlier, and not yet followed; and Next BRS Date is
  left for the following date to set. Each insert sets the account's BRS
  Opening Date (once: a second opening is refused) or its BRS Closing Date
  (`logicx_erp/bank_account.py`). Updating and deleting a BRS Date are refused
  for now.
- BRS Date form layout, and its `Design.MD`.

## [0.1.52] - 2026-09-25

### Database Changes

- **New table `tabBRS Date`** -- `bank_account` (Link → Bank Account), `date`,
  `is_opening` (Check), `previous_brs_date` / `next_brs_date` (Link → BRS
  Date) and `title`, with a unique index on (`bank_account`, `date`).
- **New `tabBank Account` columns** `brs_opening_date` and `brs_closing_date`
  (Link → BRS Date), Custom Fields after `company`, shipped as fixtures.

### Added

- **BRS Date DocType** (`LogicX HR`) -- one per Bank Account per date, a
  duplicate refused on save with the unique index behind it, titled "{Date} :
  {Account Name}". Named `BRSDATE.#`; Is Opening is permlevel 1. `TM User`
  read/create/write, `TM Admin` full plus permlevel 1.
- **Bank Account: BRS Opening Date and BRS Closing Date** fields.

## [0.1.51] - 2026-09-25

No net change: a first **BRS LogicX** DocType, one row per bank statement line,
was added and then reverted within this build. BRS Date (0.1.52) and BRS
Transaction (0.1.54) took its place.

## [0.1.50] - 2026-09-24

### Changed

- **Party Dashboard: Payment Reconciliation fetches its entries itself** --
  opened from the `+` menu on a party, it presses "Get Unreconciled Entries"
  once the receivable / payable account has loaded. With no party, or no
  account found for it, nothing is fetched.

## [0.1.49] - 2026-09-24

### Fixed

- **Party Dashboard: New Payment Entry keeps the party.** A new form opened on
  the party lost it as it loaded, as Payment Entry clears Party whenever Party
  Type is set. The Payment Entry is now made on the server
  (`new_payment_entry`), the way ERPNext makes one from an invoice -- party,
  party account, name, contact, both bank accounts and the company's letter
  head filled in -- and opened unsaved, with only the amount left. With no
  party picked it opens a plain new form, as before.

### Removed

- **General Ledger** from the Party Dashboard's `+` menu.

## [0.1.7] - 2026-09-23

### Added

- **Job Location DocType** (`LogicX HR`) -- where an employee was for an Enquiry:
  `Enquiry`, `Employee`, `Date` (default today), `Time` (default now) and the GPS
  point as `Latitude` / `Longitude` Float fields with 7 decimals (about 1 cm,
  stored as `decimal(21,9)`), the same design as HRMS Employee Checkin. Every
  save rounds and range-checks the coordinates, rejecting a missing (0, 0)
  location that `reqd` alone lets through for Float fields, and rebuilds the
  read-only `Geolocation URL` (Google Maps link; opens the Maps app on phones)
  and `Geolocation Map` (pin on an OpenStreetMap map). A "Get Current Location"
  button fills the coordinates from the device's GPS in the desk form (HTTPS
  only), and new forms pre-fill Employee from the logged-in user. Inserting, or
  changing the enquiry or coordinates, posts a "Location captured by ..." row to
  the Enquiry's Messages. Named `JOBLOC.#`; same permissions as Job Execution
  (`TM User` read/create/write, `TM Admin` full plus permlevel 1).
- **Job Location shortcut** on the LogicX HR Home workspace, next to Job Execution.
- `Frappe.Api.JobLocation.rest` REST Client examples: list for an Enquiry, read,
  create from the phone's GPS, correct the coordinates.
- **Job Attachment DocType** (`LogicX HR`) -- a document or photo for an Enquiry:
  `Enquiry`, `Employee`, `Date` (default today), `Time` (default now), the file
  in `Document` (mandatory Attach field, one file per record) and an `Is Photo`
  check. In the desk form, attaching a picture (gif / jpg / jpeg / png / svg /
  tiff) ticks `Is Photo` and any other file unticks it; the box stays editable,
  and a photo shows a preview next to the file. New forms pre-fill Employee from
  the logged-in user. Inserting, or changing the enquiry or file, posts a "Photo
  attached by ..." / "Document attached by ..." row to the Enquiry's Messages
  with a full link to the file (URL-encoded, so file names with spaces still
  work). Named `JOBATT.#`; same permissions as Job Location.
- **Job Attachment shortcut** on the LogicX HR Home workspace, next to Job Location.
- `Frappe.Api.JobAttachment.rest` REST Client examples: list for an Enquiry, read,
  upload a file, create the record for it, open a private file with the API token.
- **Party Comments** on Customer and Supplier -- a `Party Comments` Long Text
  field in a new `Comments` tab, after More Info and just ahead of Connections.
  Shipped as Custom Field fixtures, so `bench migrate` adds it.
- **Party Dashboard: Comments tab** (last in the tab strip, for both party
  types) -- the selected party's Party Comments, read-only and unlabelled, with
  line breaks kept. `Edit` at the top right (shown only to users who can write
  to the party) swaps in a Long Text box with `Cancel` / `Save`; Save writes it
  back to the Customer / Supplier through a normal document save, so the edit
  gets the form's validation and version history. Picking another party drops
  an unsaved edit.
- **Party Dashboard: comments on the Dashboard tab** -- the selected party's
  Party Comments, read-only and unlabelled, at the foot of the tiles for a quick
  read without switching tabs. Shown only when the party has comments, and
  updated as soon as an edit is saved in the Comments tab.
- **Party Dashboard: more in the `+` menu** -- `New Sales Invoice` and
  `New Delivery Note` for a Customer, `New Purchase Invoice` and
  `New Purchase Receipt` for a Supplier, then `Opening Balance` as before, and
  `New Payment Entry`, `Payment Reconciliation` and `General Ledger` for both.
  Each opens on the party picked at the top of the page: the new invoices and
  notes fill Customer / Supplier (fetching its address, price list and so on as
  if picked by hand); Payment Entry is made on the server the way ERPNext makes
  one from an invoice, with Payment Type (Receive / Pay), Party Type and Party,
  the party's account, name and contact, and the company bank account the money
  goes through; Payment Reconciliation fills Party Type and Party, and so the
  Receivable / Payable Account; General Ledger opens filtered on Party Type and
  Party. With no party picked they open without one. The other side's entries
  are hidden when the party type changes.

## [0.1.6] - 2026-09-16

### Added

- **API One DocType** (`LogicX HR`) -- define a REST endpoint by saving a record:
  `API Path` (unique), `Request Method` (GET/POST/PUT/PATCH/DELETE), `Enabled`
  and a Python `Script`. Each row manages one Frappe **Server Script (API type)**
  (`allow_guest = 0`), so Frappe serves the endpoint at `/api/method/<path>` and
  `/api/v2/method/<path>` for token/session-authenticated callers and runs the
  script in its sandbox. Saving errors when the path already exists as another
  API One, as a Server Script, or as a real Python method; the linked Server
  Script is re-synced on every save and deleted with the row. Named `API.#`.
  Permissions: `System Manager` / `Script Manager` full, `TM Admin` read
  (Server Script requires the saver to hold `Script Manager`). Requires
  `server_script_enabled` in the site config.
- **API One Log DocType** (`LogicX HR`) -- one row per call to an API One endpoint:
  path, method, query string, request headers (`Authorization` / `Cookie` /
  CSRF token redacted) and body, response status / headers / body (bodies
  truncated at 100 000 chars), plus `User`, `IP Address` and `Duration (ms)`.
  System-written only (`in_create`); named `APILOG.#`.
- **`before_request` / `after_request` hooks** (`logicx_hr/api_one_hooks.py`) --
  recognise calls to registered API One paths via a cached path map (no DB
  access for other requests), return 404 for disabled endpoints and 405 for a
  wrong HTTP verb, and write the API One Log row after every recognised call,
  including rejected ones.
- **`create_api_one_echo` patch** -- seeds a sample `POST /api/method/echo`
  endpoint that returns the request method, query and user. Skips with a notice
  when server scripts are disabled (re-run with `bench execute`).
- `API-One.MD` design document and `Frappe.Api.ApiOne.rest` REST Client
  examples (variables only, no committed token).

## [0.1.5] - 2026-08-21

### Added

- **Enquiry Status DocType** (`LogicX HR`) — master for the Enquiry "Status"
  values. Auto-named from a unique, mandatory `Status Name`, plus a mandatory
  `Status Group` Select (New / Pending / Hold / Closed) that carries the coarse
  bucket the status rolls up to and is exposed as a standard list filter.
  Ordered by `idx` (descending) so the picker keeps the order the old Select
  had. Same role permissions as the other masters: `TM User`
  (read/create/write), `TM Admin` (full, including delete/import, plus
  permlevel 1).
- **`create_enquiry_statuses` patch** — seeds the eleven default statuses with
  their groups (New→New, Open→Pending, Hold for Approval/Spares/Job-Out→Hold,
  Long Hold→New, Escalation→New, Won→Closed, Lost→Closed, Closed→Closed,
  Re-open→New) and creates a status for any other value already stored on an
  Enquiry, so no existing row ends up with a broken link. "Closed" is new — it
  was not one of the old Select options.
- **Enquiry Status link in the LogicX HR sidebar** (`workspace_sidebar/logicx_hr.json`) —
  added as a child (idx 14) of the existing "Masters" section.

### Changed

- `Enquiry.status` is now a **Link to Enquiry Status** instead of a Select with
  hard-coded options. Stored values are unchanged — the old option strings are
  the new document names — so existing Enquiry records, the "Enquiry List-In
  wise Status" / "Enquiry Owner wise Status" reports and the REST examples keep
  working.
- **Both Enquiry status reports now bucket by `Enquiry Status.status_group`**
  instead of their own hard-coded status lists, so a status added through the UI
  lands in the right column automatically and the new "Closed" status no longer
  falls into "Other". `get_status_groups()` / `get_status_bucket_map()` on the
  Enquiry Status controller are the shared source. Consequence: "Enquiry List-In
  wise Status" now has **New / Pending / Hold / Closed** columns — Won and Lost
  are merged into **Closed**, since that is the group both map to.
- `Enquiry Owner wise Status`: the "List in" filter is now a **Link to Enquiry
  Group** instead of a Select with hard-coded options left over from the 0.1.4
  refactor. Its visible columns become **Pending / Hold** (previously Open /
  Hold); the other groups are still counted but stay hidden, as before.

## [0.1.4] - 2026-08-21

### Added

- **Enquiry Group DocType** (`LogicX HR`) — master for the Enquiry "List in"
  values. Auto-named from a unique, mandatory `Group Name`; ordered by `idx`
  (descending) so the picker keeps the order the old Select had. Same role
  permissions as the other masters: `TM User` (read/create/write), `TM Admin`
  (full, including delete/import, plus permlevel 1).
- **`create_enquiry_groups` patch** — seeds the eleven default groups (Stores,
  DELL, ASUS, Spares, MBO, Service, On-site, Remote - AnyDesk, Follow, LogicX,
  Admin) and creates a group for any other value already stored on an Enquiry,
  so no existing row ends up with a broken link.
- **"Masters" section in the LogicX HR sidebar** (`workspace_sidebar/logicx_hr.json`) —
  collapsible section (idx 12) at the end, with **Enquiry Group** as its child link.

### Changed

- `Enquiry.group` ("List in") is now a **Link to Enquiry Group** instead of a
  Select with hard-coded options. Stored values are unchanged — the old option
  strings are the new document names — so existing Enquiry records, the
  "Enquiry List-In wise Status" report and the REST examples keep working.

## [0.1.3] - 2026-08-19

### Added

- **Rack DocType** (`LogicX ERP`) — master for storage racks. Auto-named from a
  unique, mandatory `Rack Name`. Permissions: `TM User` (read/create/write),
  `TM Admin` (full, including delete/import, plus permlevel 1).
- **Crate DocType** (`LogicX ERP`) — master for crates, with a `Crate Name`
  (unique, mandatory, auto-name source) and an optional `Rack` link so a crate can
  be located on a rack. `Rack` is exposed as a standard list filter. Same role
  permissions as Rack.
- **`Item.crate` custom field** — a `Crate` link on **Item**, inserted after
  `stock_uom` and available as a standard filter, tying stock items to the crate
  they are stored in.
- **"Doc" section on the LogicX ERP home workspace** — new header block with
  shortcuts and workspace links to **Item**, **Rack** and **Crate**.
- **"Doc" section in the LogicX ERP sidebar** (`workspace_sidebar/logicx_erp.json`) —
  collapsible section (idx 13) with child links to Item, Rack and Crate.

### Changed

- `hooks.py`: the `Custom Field` fixture filter now also exports `Item-crate`
  alongside `Employee-cost_per_hour`.
- `fixtures/custom_field.json`: regenerated to include the `Item-crate` definition.

## [0.1.2] - 2026-08-19

### Added

- Initial release: `LogicX HR` and `LogicX ERP` modules, the LogicX ERP home
  workspace and sidebar with stock, sales, receipts and outstanding reports, the
  `Employee-cost_per_hour` custom field, desk fixes and TM role fixtures.
