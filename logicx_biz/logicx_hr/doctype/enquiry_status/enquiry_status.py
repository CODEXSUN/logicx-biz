import frappe
from frappe.model.document import Document


class EnquiryStatus(Document):
	pass


def get_status_groups():
	"""The Status Group options, in the order the Select declares them.

	Reports use this as their column order, so adding a group to the Select is
	enough to make it show up as a column.
	"""
	options = frappe.get_meta("Enquiry Status").get_field("status_group").options or ""
	return [option for option in options.split("\n") if option]


def get_status_bucket_map():
	"""{status name: report bucket}, the bucket being the scrubbed Status Group.

	Statuses whose group is not one of the current Select options are left out,
	so callers fall back to their own "other" bucket -- as does any value stored
	on an Enquiry that no longer has an Enquiry Status master.
	"""
	valid_groups = set(get_status_groups())
	return {
		status.name: frappe.scrub(status.status_group)
		for status in frappe.get_all("Enquiry Status", fields=["name", "status_group"])
		if status.status_group in valid_groups
	}
