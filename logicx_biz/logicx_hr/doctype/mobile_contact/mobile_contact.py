from frappe.model.document import Document

from logicx_biz.logicx_erp.mobile_validation import validate_mobile_number


class MobileContact(Document):
	def validate(self):
		# the name is already the trimmed number; keep the field the same for imports and the API
		self.mobile_number = (self.mobile_number or "").strip()
		validate_mobile_number(self.mobile_number, self.meta.get_label("mobile_number"))

	def before_rename(self, old, new, merge=False):
		# rename doesn't run validate, yet Frappe writes the new name into mobile_number,
		# so the new name gets the same check; returning it hands Frappe the trimmed name
		new = (new or "").strip()
		validate_mobile_number(new, self.meta.get_label("mobile_number"))
		return new
