"""API One: define a REST endpoint by saving a record.

Each row is a facade over one Frappe *Server Script* of type "API". Saving the
row creates or re-syncs that Server Script (same path, script, enabled flag,
never guest-callable), so Frappe itself serves the endpoint at
``/api/method/<api_path>`` and ``/api/v2/method/<api_path>`` and runs the
script in its restricted sandbox as the authenticated caller.

HTTP-method enforcement and API One Log writing live in
``logicx_biz.logicx_hr.api_one_hooks`` (before_request / after_request).
"""

import re

import frappe
from frappe import _
from frappe.model.document import Document

from logicx_biz.logicx_hr.api_one_hooks import API_ONE_PATHS_CACHE_KEY

API_PATH_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_.\-]*$")
SERVER_SCRIPT_NAME_PREFIX = "API One "


class APIOne(Document):
	def validate(self):
		self.api_path = (self.api_path or "").strip()
		self.validate_api_path()
		self.validate_server_scripts_enabled()
		self.validate_path_is_free()

	def on_update(self):
		self.sync_server_script()
		clear_paths_cache()

	def on_trash(self):
		if self.server_script and frappe.db.exists("Server Script", self.server_script):
			# force: the Server Script is still linked from this (not yet deleted) row
			frappe.delete_doc(
				"Server Script", self.server_script, ignore_permissions=True, force=True
			)
		clear_paths_cache()

	# ---- validation ---------------------------------------------------------------------------

	def validate_api_path(self):
		if not API_PATH_PATTERN.fullmatch(self.api_path) or ".." in self.api_path:
			frappe.throw(
				_(
					"API Path '{0}' is invalid. Use letters, digits, underscore, dot or hyphen, "
					"start with a letter, and do not use slashes."
				).format(self.api_path),
				title=_("Invalid API Path"),
			)

	def validate_server_scripts_enabled(self):
		from frappe.utils.safe_exec import is_safe_exec_enabled

		if not is_safe_exec_enabled():
			frappe.throw(
				_(
					"Server scripts are disabled on this site, so API One endpoints cannot run. "
					"Enable them with: <code>bench --site {0} set-config server_script_enabled true</code>"
				).format(frappe.local.site),
				title=_("Server Scripts Disabled"),
			)

	def validate_path_is_free(self):
		"""Error if the path already exists anywhere it could be resolved from."""
		other_api_one = frappe.db.get_value(
			"API One", {"api_path": self.api_path, "name": ("!=", self.name)}, "name"
		)
		if other_api_one:
			frappe.throw(
				_("API Path '{0}' already exists: {1}").format(
					self.api_path, frappe.get_desk_link("API One", other_api_one)
				),
				title=_("Duplicate API Path"),
				exc=frappe.DuplicateEntryError,
			)

		other_server_script = frappe.db.get_value(
			"Server Script",
			{"script_type": "API", "api_method": self.api_path, "name": ("!=", self.server_script or "")},
			"name",
		)
		if other_server_script:
			frappe.throw(
				_("API Path '{0}' is already served by Server Script {1}").format(
					self.api_path, frappe.get_desk_link("Server Script", other_server_script)
				),
				title=_("Duplicate API Path"),
				exc=frappe.DuplicateEntryError,
			)

		if resolves_to_python_method(self.api_path):
			frappe.throw(
				_("API Path '{0}' clashes with an existing method and would shadow it").format(
					self.api_path
				),
				title=_("Duplicate API Path"),
				exc=frappe.DuplicateEntryError,
			)

	# ---- server script sync -------------------------------------------------------------------

	def sync_server_script(self):
		"""Create or update the Server Script that actually serves this endpoint."""
		script_name = self.server_script or f"{SERVER_SCRIPT_NAME_PREFIX}{self.name}"
		if frappe.db.exists("Server Script", script_name):
			server_script = frappe.get_doc("Server Script", script_name)
		else:
			# Server Script is named by prompt, so a preset name is honoured on insert
			server_script = frappe.new_doc("Server Script")
			server_script.name = script_name

		server_script.script_type = "API"
		server_script.api_method = self.api_path
		server_script.allow_guest = 0
		server_script.disabled = 0 if self.enabled else 1
		server_script.script = self.script
		# Server Script.validate compiles the script, so syntax errors surface on this save
		server_script.save(ignore_permissions=True)

		if server_script.name != self.server_script:
			self.db_set("server_script", server_script.name, update_modified=False)


def resolves_to_python_method(dotted_path):
	"""True if ``frappe.get_attr`` can import the path, i.e. a real method exists there."""
	if "." not in dotted_path:
		return False
	try:
		frappe.get_attr(dotted_path)
	except (ImportError, AttributeError, ValueError):
		return False
	return True


def clear_paths_cache():
	frappe.cache.delete_value(API_ONE_PATHS_CACHE_KEY)