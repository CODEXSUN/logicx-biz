"""Seed the sample "echo" API One endpoint.

Gives a freshly migrated site one working endpoint to try the API One / API One Log
flow against (see API-One.MD and the Frappe.Api.ApiOne.rest client file):

	POST /api/method/echo   ->  {"message": {"method": "POST", "query": {...}, "user": "..."}}

API One rows need server scripts to be enabled on the site
(`bench --site <site> set-config server_script_enabled true`). When they are
not, this patch prints a notice and skips instead of failing the migration;
re-run it later with

	bench --site <site> execute logicx_biz.patches.create_api_one_echo.execute
"""

import frappe
from frappe.utils.safe_exec import is_safe_exec_enabled

ECHO_PATH = "echo"

ECHO_SCRIPT = """frappe.response["message"] = {
	"method": frappe.request.method,
	"query": dict(frappe.form_dict),
	"user": frappe.session.user,
}
"""


def execute():
	if frappe.db.exists("API One", {"api_path": ECHO_PATH}):
		return

	if not is_safe_exec_enabled():
		print(
			"API One: server scripts are disabled on this site; the sample 'echo' endpoint was not "
			"created. Enable them (bench set-config server_script_enabled true) and run "
			"`bench execute logicx_biz.patches.create_api_one_echo.execute`."
		)
		return

	api_one = frappe.new_doc("API One")
	api_one.api_path = ECHO_PATH
	api_one.request_method = "POST"
	api_one.enabled = 1
	api_one.script = ECHO_SCRIPT
	api_one.insert(ignore_permissions=True)