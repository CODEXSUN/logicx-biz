# Apparel Command Poll

Send a command to the apparel device from the desk; the device collects it on its next poll.

| Piece | Where | Purpose |
|-------|-------|---------|
| **Apparel Dashboard** page, Commands tab | `logicx_biz/logicx_hr/page/apparel_dashboard/` | The command box and Send button. |
| `set_command` / `pop_command` | `logicx_biz/logicx_hr/apparel_dashboard.py` | Store the command / hand it over and empty the slot. |
| `apparel-command` endpoint | API One row (see [API-One.MD](API-One.MD)) | What the device polls: `GET /api/method/apparel-command`. |
| `apparel_command` cache key | Site Redis (`frappe.cache`) | The one slot the command waits in. |

## How it works

```
desk user                                   device
   |                                           |
   |  types command, Send / Ctrl+Enter         |
   v                                           |
frappe.xcall set_command(command) ---+         |
                                     |         |
              frappe.cache.set_value("apparel_command", command, expires_in_sec=300)
                                     |         |
                                     |   GET /api/method/apparel-command  (every poll)
                                     |         |
                                     |   Server Script (API One) ---- frappe.call(pop_command)
                                     |         |                          |
                                     +---> get_value  -> "cmd"   delete_value
                                               |
                                     {"message": {"command": "cmd"}}      <- this poll
                                     {"message": {"command": ""}}         <- every poll after
```

1. **Send** on the Commands tab calls the whitelisted `set_command(command)`. It trims the text,
   rejects an empty one, and writes it to the site's Redis cache under `apparel_command`.
   The box is cleared only after the call succeeds, so a failed send leaves the text to retry.
   A line beside the Send button, `Sending command ... <text>`, shows what is still waiting for
   the device: set the moment Send is clicked, then kept current by the page's poll of
   `get_state()` (below). It is always on screen; with the slot empty it reads `-`.
2. The device polls `GET /api/method/apparel-command`. That is an API One endpoint, so the
   `before_request` / `after_request` hooks apply: wrong verb -> 405, disabled -> 404, and
   every poll is written to **API One Log** -- which is what the Commands tab lists beneath the
   box (`response_content` of rows with `api_path = apparel-command`).
3. The endpoint's Server Script calls `pop_command()`, which returns the queued command (or
   `""`) and deletes the key when there was one. The response is
   `{"message": {"command": "<text>"}}` on the first poll after a send, `{"command": ""}` on
   every poll after -- **a command is delivered exactly once**.

### Rules that fall out of this

- **One slot, last send wins.** Sending again before the device has polled replaces the
  earlier command; there is no queue.
- **A command expires after `COMMAND_TTL_SEC` (300 s).** If the device does not poll within
  that window the key lapses and the poll gets `""`. The TTL is the constant at the top of
  `apparel_dashboard.py`.
- **No log row on send.** API One Log rows are written by the device's poll, not by Send, so
  a new card appears in the Commands tab only once the device has collected the command.
- **The page keeps itself current with a lightweight poll.** Every 4 s (`POLL_MS`) it calls
  `get_state(api_paths)`, which answers with the pending command and, per `api_path`, the
  `creation` of the newest API One Log row -- one Redis read and one `GROUP BY`, no row bodies.
  The "Sending command ..." line is set from that answer, and the open tab's cards are
  re-fetched only when its newest `creation` differs from the newest card on screen (quietly:
  no "Loading..." flash). The poll pauses while the browser tab is hidden or another desk page
  is open. Refresh still forces an immediate reload.
- **Who may do what.** `set_command` is held to the page's roles (System Manager, TM Admin).
  `pop_command` is open when called from inside a Server Script (`frappe.flags.in_safe_exec`,
  which the sandbox sets), i.e. through the endpoint the device is authorised to hit; a direct
  `/api/method/...pop_command` call from anywhere else needs the page's roles too.

## The endpoint script

API One row: `api_path = apparel-command`, `request_method = GET`, enabled. The script lives
in that row (database), and a copy is kept as `COMMAND_SCRIPT` in `apparel_dashboard.py`:

```python
# apparel-command: GET. answers the command queued on the Apparel Dashboard
# (logicx_biz.logicx_hr.apparel_dashboard.set_command) and empties the slot,
# so the same command is never delivered twice. pop_command does both: the
# sandbox has no frappe.cache of its own.
frappe.response["command"] = frappe.call("logicx_biz.logicx_hr.apparel_dashboard.pop_command")

# or #

frappe.response["message"] = {
	"command": frappe.call("logicx_biz.logicx_hr.apparel_dashboard.pop_command"),
	"user": frappe.session.user,
}
```

## Why it is built this way

- **Redis, not a variable.** A JS global never reaches the server. A Python module global is
  per process: the desk request that stores the command and the device request that reads it
  land on different gunicorn workers, so one would never see the other's value. `frappe.cache`
  is shared by every worker on the site.
- **Redis, not a DocType.** A single pending value needs no history or permissions of its own;
  API One Log already records what each poll was answered with.
- **`frappe.call` from the script, not `frappe.cache`.** The Server Script sandbox
  (`frappe.utils.safe_exec`) does not expose `frappe.cache`; reading it there yields `None`,
  and `frappe.cache.get_value(...)` fails with `TypeError: 'NoneType' object is not callable`.
  The sandbox does expose `frappe.call(<dotted path>)` to whitelisted functions, so the
  cache read-and-delete sits in `pop_command` and the script only calls it. The whitelist
  check is done by `frappe.call` itself; nothing needs registering in `hooks.py`.

## Code map

| File | Role |
|------|------|
| `logicx_biz/logicx_hr/apparel_dashboard.py` | `set_command()`, `get_state()`, `pop_command()`, `COMMAND_CACHE_KEY`, `COMMAND_TTL_SEC`, `PAGE_ROLES`, `COMMAND_SCRIPT` |
| `logicx_biz/logicx_hr/page/apparel_dashboard/apparel_dashboard.js` | `send_command()` -> `frappe.xcall(SET_COMMAND_METHOD)`; `poll()` / `apply_state()` every `POLL_MS`; Commands tab lists the `apparel-command` API One Log |
| `logicx_biz/logicx_hr/page/apparel_dashboard/apparel_dashboard.json` | Page roles: System Manager, TM Admin |
| `logicx_biz/logicx_hr/doctype/api_one/Frappe.Api.ApiOne.rest` | REST Client request for the poll (`### 0. GET apparel-command`) |

## Trying it

1. Make sure server scripts are enabled and the `apparel-command` API One row exists with the
   script above (`bench restart` after pulling `apparel_dashboard.py` for the first time).
2. Desk -> Apparel Dashboard -> Commands: type something, Send. Alert: "Command queued for the
   device's next poll."; the line beside Send reads `Sending command ... <text>`.
3. In `Frappe.Api.ApiOne.rest`, run `GET {{baseUrl}}/api/method/apparel-command` -> the text you
   typed. Run it again -> `"command": ""`.
4. Within about 4 s the line drops to `-` and two new cards, one per poll, show up at the top
   of the Commands tab by themselves (the Network tab shows one `get_state` per tick and a
   `get_list` only on the tick that saw the change).
