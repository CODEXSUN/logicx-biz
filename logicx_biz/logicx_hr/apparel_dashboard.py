"""Server side of the Apparel Dashboard page (page/apparel_dashboard).

The Commands tab queues one command for the device. The page stores it here,
in the site's Redis cache under COMMAND_CACHE_KEY, and the ``apparel-command``
API One endpoint the device polls hands it over and empties the slot -- so a
command is delivered once, to the first poll after it was sent.

Redis rather than a module-level variable because the desk request that stores
the command and the device request that reads it land on different gunicorn
workers; rather than a DocType because a single pending value needs no history
(the API One Log already records what each poll was answered with).

The Server Script sandbox does not expose ``frappe.cache`` (reading it there
gives a ``None``), so the endpoint reaches the cache through ``frappe.call``
to the whitelisted ``pop_command`` below. The endpoint's script is kept in
COMMAND_SCRIPT so the repo carries it; paste it into the API One row for
``apparel-command`` (request method GET).
"""

import frappe
from frappe import _

COMMAND_CACHE_KEY = "apparel_command"
# a command the device has not collected within this long is dropped rather
# than delivered stale on some much later poll
COMMAND_TTL_SEC = 300

# the roles the page itself is limited to (page/apparel_dashboard.json)
PAGE_ROLES = ("System Manager", "TM Admin")

COMMAND_SCRIPT = '''# apparel-command: GET. answers the command queued on the Apparel Dashboard
# (logicx_biz.logicx_hr.apparel_dashboard.set_command) and empties the slot,
# so the same command is never delivered twice. pop_command does both: the
# sandbox has no frappe.cache of its own.
frappe.response["message"] = {
	"command": frappe.call("logicx_biz.logicx_hr.apparel_dashboard.pop_command"),
}
'''


@frappe.whitelist()
def set_command(command: str) -> None:
	"""Queue `command` for the device's next poll of ``apparel-command``.

	Replaces whatever was queued before and not yet collected; the dashboard
	is the only writer, so last send wins. Expires after COMMAND_TTL_SEC.
	"""
	frappe.only_for(PAGE_ROLES)

	command = (command or "").strip()
	if not command:
		frappe.throw(_("Command is empty"))

	frappe.cache.set_value(COMMAND_CACHE_KEY, command, expires_in_sec=COMMAND_TTL_SEC)


@frappe.whitelist()
def get_state(api_paths) -> dict:
	"""What the dashboard polls every few seconds: the queued command (left in
	place; only the device's poll empties it) and, per api_path, when the
	newest API One Log row was written.

	Enough for the page to tell whether the cards it shows are stale without
	fetching them: one Redis read and one GROUP BY, no row bodies.
	"""
	frappe.only_for(PAGE_ROLES)

	api_paths = frappe.parse_json(api_paths) if isinstance(api_paths, str) else api_paths
	# get_list rather than get_all so the same read permission applies as to
	# the page's own fetch of the rows
	rows = frappe.get_list(
		"API One Log",
		# the aggregate as a dict: this frappe rejects "max(creation)" as a string
		fields=["api_path", {"MAX": "creation", "as": "latest"}],
		filters={"api_path": ("in", list(api_paths or []))},
		group_by="api_path",
	)

	return {
		"command": frappe.cache.get_value(COMMAND_CACHE_KEY) or "",
		# str: the page compares it with the creation strings get_list gives it
		"latest": {row.api_path: str(row.latest) for row in rows},
	}


@frappe.whitelist()
def pop_command() -> str:
	"""The queued command, or "" when there is none -- and the slot emptied.

	Called by the ``apparel-command`` Server Script on the device's behalf;
	that endpoint is the door for the device, so a direct call from anywhere
	else is held to the page's own roles.
	"""
	if not frappe.flags.in_safe_exec:
		frappe.only_for(PAGE_ROLES)

	command = frappe.cache.get_value(COMMAND_CACHE_KEY) or ""
	if command:
		frappe.cache.delete_value(COMMAND_CACHE_KEY)
	return command
