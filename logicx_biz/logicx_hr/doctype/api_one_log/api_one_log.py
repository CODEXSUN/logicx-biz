"""API One Log: one row per call to an endpoint defined in API One.

Rows are written only by ``logicx_biz.logicx_hr.api_one_hooks.after_request``;
the doctype is ``in_create`` so nobody creates them from the desk.
"""

from frappe.model.document import Document


class APIOneLog(Document):
	pass