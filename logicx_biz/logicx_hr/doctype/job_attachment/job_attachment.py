from urllib.parse import quote

import frappe
from frappe.model.document import Document
from frappe.utils import format_time, formatdate, get_url

from logicx_biz.logicx_hr.doctype.job_activity.job_activity import add_job_activity

MESSAGE_TEMPLATE = "{kind} attached by {employee} at {date} {time}: {url}"
TRIGGER_FIELDS = ("job_type", "job_id", "document")


class JobAttachment(Document):
	def on_update(self):
		if any(self.has_value_changed(fieldname) for fieldname in TRIGGER_FIELDS):
			self.post_job_activity()

	def post_job_activity(self):
		if not self.job_id or not self.document:
			return

		employee_name = frappe.get_cached_value("Employee", self.employee, "employee_name") or self.employee
		activity_details = MESSAGE_TEMPLATE.format(
			kind="Photo" if self.is_photo else "Document",
			employee=employee_name,
			date=formatdate(self.date),
			time=format_time(self.time, "hh:mm a"),
			url=get_file_link(self.document),
		)
		add_job_activity(self.job_type, self.job_id, activity_details)


def get_file_link(file_url):
	"""Full link to an attached file, so it also opens when the Job Activity is read outside the desk."""
	if file_url.startswith(("/files/", "/private/files/")):
		# uploaded file names often have spaces ("WhatsApp Image ... .jpeg"), which would cut the link short
		file_url = quote(file_url)
	# links to other sites come back unchanged
	return get_url(file_url)
