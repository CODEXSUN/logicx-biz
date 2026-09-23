from urllib.parse import quote

import frappe
from frappe.model.document import Document
from frappe.utils import format_time, formatdate, get_url

from logicx_biz.logicx_hr.doctype.enquiry.enquiry import add_enquiry_message

MESSAGE_TEMPLATE = "{kind} attached by {employee} at {date} {time}: {url}"
TRIGGER_FIELDS = ("enquiry", "document")


class JobAttachment(Document):
	def on_update(self):
		if any(self.has_value_changed(fieldname) for fieldname in TRIGGER_FIELDS):
			self.post_enquiry_message()

	def post_enquiry_message(self):
		if not self.enquiry or not self.document:
			return

		employee_name = frappe.get_cached_value("Employee", self.employee, "employee_name") or self.employee
		comment = MESSAGE_TEMPLATE.format(
			kind="Photo" if self.is_photo else "Document",
			employee=employee_name,
			date=formatdate(self.date),
			time=format_time(self.time, "hh:mm a"),
			url=get_file_link(self.document),
		)
		add_enquiry_message(self.enquiry, comment)


def get_file_link(file_url):
	"""Full link to an attached file, so it also opens from the Enquiry message shared on WhatsApp."""
	if file_url.startswith(("/files/", "/private/files/")):
		# uploaded file names often have spaces ("WhatsApp Image ... .jpeg"), which would cut the link short
		file_url = quote(file_url)
	# links to other sites come back unchanged
	return get_url(file_url)
