# Changelog

All notable changes to **logicx-biz** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
