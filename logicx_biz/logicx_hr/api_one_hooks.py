"""Request hooks for API One endpoints (see hooks.py: before_request / after_request).

Execution of an API One endpoint is done by Frappe itself through the Server
Script that API One manages. These two hooks add what Server Script lacks:

* ``before_request`` -- recognise ``/api/method/<api_path>`` (v1 or v2) calls
  to a registered API One, reject disabled endpoints (404) and wrong HTTP
  verbs (405), and remember the match for the logger.
* ``after_request`` -- write one API One Log row per recognised call, including
  rejected ones, with secrets redacted and large bodies truncated.

Both hooks run on every HTTP request the site serves, so the fast path (a path
that is not an API One) must cost nothing: a regex on the URL and a lookup in a
cached ``api_path -> docname`` map, no database access.
"""

import json
import re
import time

import frappe
from werkzeug.exceptions import MethodNotAllowed, NotFound

API_METHOD_PATH = re.compile(r"^/api/(?:v[12]/)?method/(?P<method>[^/?#]+)/?$")
API_ONE_PATHS_CACHE_KEY = "api_one_paths"
MAX_BODY_CHARS = 100_000
TRUNCATED_MARKER = "\n...[truncated]"
REDACTED_HEADERS = {"authorization", "cookie", "x-frappe-csrf-token"}
REDACTED_VALUE = "***"


def before_request():
	request = getattr(frappe.local, "request", None)
	if request is None or request.method == "OPTIONS":
		return

	match = API_METHOD_PATH.match(request.path)
	if not match:
		return

	api_path = match.group("method")
	paths = get_registered_paths()
	if api_path not in paths:
		return

	api_one = frappe.get_cached_doc("API One", paths[api_path])
	frappe.local.api_one = api_one
	frappe.local.api_one_started = time.perf_counter()

	# A rejection here is returned by frappe.app.application as-is, so after_request
	# gets response=None; keep the intended status for the log.
	if not api_one.enabled:
		frappe.local.api_one_status = 404
		raise NotFound(description=f"API '{api_path}' is disabled")

	if request.method != api_one.request_method:
		frappe.local.api_one_status = 405
		raise MethodNotAllowed(
			valid_methods=[api_one.request_method],
			description=f"API '{api_path}' accepts {api_one.request_method} only",
		)


def after_request(response=None, request=None):
	api_one = getattr(frappe.local, "api_one", None)
	if api_one is None or not getattr(frappe.local, "db", None):
		return

	try:
		write_api_one_log(api_one, request or frappe.local.request, response)
	except Exception:
		# logging must never break the API response; nothing commits after this hook,
		# so the Error Log row needs a clean transaction and its own commit
		try:
			frappe.db.rollback()
			frappe.log_error(title="API One Log write failed")
			frappe.db.commit()
		except Exception:
			pass


# ---- helpers ------------------------------------------------------------------------------------


def get_registered_paths():
	"""``{api_path: docname}`` for every API One row, cached until a row is saved or deleted."""
	return frappe.cache.get_value(
		API_ONE_PATHS_CACHE_KEY,
		generator=lambda: {
			row.api_path: row.name for row in frappe.get_all("API One", fields=["name", "api_path"])
		},
	)


def write_api_one_log(api_one, request, response):
	started = getattr(frappe.local, "api_one_started", None)
	duration_ms = round((time.perf_counter() - started) * 1000) if started else None

	if response is not None:
		status_code = response.status_code
		response_header = dict(response.headers)
		response_content = get_response_content(response)
	else:
		status_code = getattr(frappe.local, "api_one_status", None) or 500
		response_header = {}
		response_content = None

	log = frappe.get_doc(
		{
			"doctype": "API One Log",
			"api_path": api_one.api_path,
			"request_method": request.method,
			"request_query": request.query_string.decode(errors="replace"),
			"request_header": json.dumps(redact_headers(request.headers), indent=1),
			"request_content": truncate(get_request_content(request)),
			"response_status_code": status_code,
			"response_header": json.dumps(response_header, indent=1),
			"response_content": truncate(response_content),
			"user": frappe.session.user,
			"ip_address": getattr(frappe.local, "request_ip", None),
			"duration_ms": duration_ms,
		}
	)
	log.insert(ignore_permissions=True)
	# after_request hooks run once the request's own transaction is already closed
	frappe.db.commit()


def redact_headers(headers):
	return {
		key: (REDACTED_VALUE if key.lower() in REDACTED_HEADERS and value else value)
		for key, value in headers.items()
	}


def get_request_content(request):
	# werkzeug caches the body Frappe already read while building form_dict
	content = request.get_data(as_text=True)
	if content:
		return content
	if request.form:
		return json.dumps(request.form.to_dict(flat=False), indent=1)
	return None


def get_response_content(response):
	try:
		return response.get_data(as_text=True)
	except RuntimeError:
		# streamed / direct_passthrough responses have no buffered body
		return None


def truncate(text):
	if text and len(text) > MAX_BODY_CHARS:
		return text[:MAX_BODY_CHARS] + TRUNCATED_MARKER
	return text