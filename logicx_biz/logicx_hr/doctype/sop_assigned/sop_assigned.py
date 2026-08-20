# Copyright (c) 2026, LogicX and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class SOPAssigned(Document):

	def validate(self):
		exists = frappe.db.exists(
			"SOP Assigned",
			{
				"sop_item": self.sop_item,
				"user": self.user,
				"name": ["!=", self.name]
			}
		)
		if exists:
			frappe.throw("This SOP is already assigned to this User.")
