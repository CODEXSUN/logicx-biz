# API One / API One Log

Define a new REST endpoint by adding a record, and record every call to it.

| DocType   | Module    | Purpose |
|-----------|-----------|---------|
| **API One** | LogicX HR | One row = one endpoint: path, HTTP method, enabled flag, Python script. |
| **API One Log** | LogicX HR | One row = one call to an API One endpoint: request + response + who/where/how long. |

## How it works

```
client -- POST /api/method/<api_path> --> Frappe
                                          |
        before_request hook  -------------+ path registered in API One?   no  -> normal Frappe handling
                                          | disabled?                     yes -> 404
                                          | HTTP method != request_method? yes -> 405
                                          |
        Server Script (API type) ---------+ Frappe resolves <api_path> to the Server Script that
                                          | API One manages and runs its script via safe_exec
                                          | (token / session auth required -- allow_guest = 0)
                                          |
        after_request hook ---------------+ writes API One Log (headers redacted, bodies truncated)
```

API One is a **facade over Frappe's built-in Server Script (API type)**. Saving an API One row
creates or updates a Server Script named `API One <docname>` with `script_type = API`,
`api_method = api_path`, `allow_guest = 0`, `disabled = not enabled`, `script = script`.
Frappe therefore serves the endpoint at

- `/api/method/<api_path>` -- response wrapped in `{"message": ...}`
- `/api/v2/method/<api_path>` -- response wrapped in `{"data": ...}`

exactly like any whitelisted method, using the caller's token or session. The two hooks add
what Server Script does not have: enforcing the HTTP verb and logging.

### Prerequisites

- Server scripts must be enabled on the site (required by Frappe for any `safe_exec`):

  ```sh
  bench --site <site> set-config server_script_enabled true
  ```

- The user who **saves** an API One row needs the **Script Manager** role (Frappe's Server
  Script controller enforces `frappe.only_for("Script Manager")`; Administrator bypasses).
  API One grants create/write to `System Manager` and `Script Manager`; `TM Admin` can read.

## API One

Naming: `API.#` -> `API1`, `API2`, ... Title: `api_path`.

| Field | Type | Notes |
|-------|------|-------|
| `api_path` | Data, reqd, unique | Becomes `/api/method/<api_path>`. Pattern `^[A-Za-z][A-Za-z0-9_.\-]*$` -- no slashes, no `..`. Editable; the linked Server Script follows. |
| `request_method` | Select: GET / POST / PUT / PATCH / DELETE | The only verb accepted; anything else -> 405. |
| `enabled` | Check, default 1 | Off -> Server Script disabled and calls -> 404 (still logged). |
| `script` | Code (Python), reqd | Runs in Frappe's restricted sandbox. Put the result in `frappe.response["message"]`. Available: `frappe.request`, `frappe.form_dict`, `frappe.session.user`, `frappe.get_list`, `frappe.get_doc`, `frappe.db.get_value`, ... (see Frappe -> Server Script docs). |
| `server_script` | Link -> Server Script, read-only | The record API One manages. Do not edit it directly; it is overwritten on every save and deleted with the row. |

Validation ("error if already exists"):

1. `api_path` must match the pattern above.
2. Server scripts must be enabled on the site -- otherwise a clear error with the `set-config` command.
3. Another **API One** row with the same path -> error naming that row.
4. A **Server Script** (not ours) already registered with `api_method == api_path` -> error.
5. `api_path` resolves to a real Python method (`frappe.get_attr`, e.g. `frappe.client.get_list`) -> error.
6. Syntax errors in `script` are raised by Server Script's own compile step at save time.

Example script (the seeded `echo` endpoint):

```python
frappe.response["message"] = {
	"method": frappe.request.method,
	"query": dict(frappe.form_dict),
	"user": frappe.session.user,
}
```

Form: the intro line shows the resolved endpoint (`POST /api/method/echo`); the **View Logs**
button opens API One Log filtered by this path.

## API One Log

Naming: `APILOG.#` -> `APILOG1`, `APILOG2`, ... Created only by the `after_request` hook
(`in_create = 1`); `System Manager` can read/delete, `TM Admin` can read.

| Field | Type | Content |
|-------|------|---------|
| `api_path` | Data | Matched API One path |
| `request_method` | Data | Actual HTTP verb used |
| `request_query` | Small Text | Raw query string |
| `request_header` | Code (JSON) | All request headers; `Authorization`, `Cookie`, `X-Frappe-CSRF-Token` values replaced by `***` |
| `request_content` | Code | Raw body (or form fields as JSON); truncated at 100 000 chars |
| `response_status_code` | Int | 200, 404 (disabled), 405 (wrong verb), 401/403 (no auth), 417/500 (script error) ... |
| `response_header` | Code (JSON) | Response headers |
| `response_content` | Code | Response body; truncated at 100 000 chars |
| `user` | Link -> User | `frappe.session.user` (`Guest` when no token) |
| `ip_address` | Data | `frappe.local.request_ip` |
| `duration_ms` | Int | before_request -> after_request wall time |

Only paths registered in API One are logged -- including calls rejected with 404/405 so
attempts are visible. Unregistered paths never touch the database (a cached
`api_path -> docname` map is consulted first; it is invalidated whenever an API One row is
saved or deleted).

## Code map

| File | Role |
|------|------|
| `logicx_biz/logicx_hr/doctype/api_one/` | DocType JSON, controller (`validate`, `on_update` -> `sync_server_script`, `on_trash`), form JS, `Frappe.Api.ApiOne.rest` client examples |
| `logicx_biz/logicx_hr/doctype/api_one_log/` | DocType JSON, empty controller |
| `logicx_biz/logicx_hr/api_one_hooks.py` | `before_request()` (match, 404/405) and `after_request()` (write API One Log) |
| `logicx_biz/hooks.py` | `before_request` / `after_request` registrations |
| `logicx_biz/patches/create_api_one_echo.py` | Seeds the sample `echo` endpoint (skips with a notice when server scripts are disabled; re-run with `bench --site <site> execute logicx_biz.patches.create_api_one_echo.execute`) |

Implementation notes:

- `after_request` runs after Frappe has already committed or rolled back the request's
  transaction, so the API One Log insert does its own `frappe.db.commit()`. Any failure while
  logging is sent to Error Log and never breaks the API response.
- When `before_request` rejects a call (404/405) it raises a werkzeug `HTTPException`;
  `frappe.app.application` returns it directly, so `after_request` receives `response=None`.
  The hook stashes the intended status in `frappe.local.api_one_status` for the log.
- The request body is read from werkzeug's cache (`request.get_data()`), which Frappe already
  filled while building `form_dict`; for form-encoded bodies the parsed form is logged as JSON.

## Trying it

1. `bench --site <site> set-config server_script_enabled true`
2. `bench --site <site> migrate` -- creates both doctypes and the `echo` endpoint.
3. Open `logicx_biz/logicx_hr/doctype/api_one/Frappe.Api.ApiOne.rest` in VS Code REST Client
   with `baseUrl` and `token` set in your environment; run the requests top to bottom:
   200 (v1), 200 (v2), 405 (GET), 401/403 (no token), then list the API One Log rows just created.