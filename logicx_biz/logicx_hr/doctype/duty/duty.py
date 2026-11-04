# Copyright (c) 2026, LogicX and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class Duty(Document):

	def validate(self):
		exists = frappe.db.exists(
			"Duty",
			{
				"sop": self.sop,
				"employee": self.employee,
				"name": ["!=", self.name]
			}
		)
		if exists:
			frappe.throw("This SOP is already assigned to this Employee.")
