import frappe
from frappe.model.document import Document

# an Enquiry has one Member per Date and Role, kept in step by the Enquiry itself
# (see Enquiry.on_update and Enquiry.on_trash); no role may edit them by hand
LEAD_CREATOR = "Lead Creator"
JOB_ASSIGNEE = "Job Assignee"


class EnquiryDailyRole(Document):
	pass


def merge(enquiry, date, role, member):
	"""Make member the Enquiry's Member for date and role; no member takes the role off it."""
	enquiry_daily_role = read_by_enquiry_date_role(enquiry, date, role)
	if enquiry_daily_role is None:
		if member is not None:
			insert(enquiry, date, role, member)
	elif member is not None:
		update(enquiry_daily_role, member)
	else:
		delete(enquiry_daily_role)


def read_by_enquiry_date_role(enquiry, date, role):
	return frappe.db.get_value(
		"Enquiry Daily Role",
		{"enquiry": enquiry, "date": date, "role": role},
		["name", "member"],
		as_dict=True,
	)


def insert(enquiry, date, role, member):
	frappe.get_doc(
		{
			"doctype": "Enquiry Daily Role",
			"enquiry": enquiry,
			"date": date,
			"role": role,
			"member": member,
		}
	).insert(ignore_permissions=True)


def update(enquiry_daily_role, member):
	# every save of the Enquiry merges again; most leave the Member as it was
	if enquiry_daily_role.member != member:
		frappe.db.set_value("Enquiry Daily Role", enquiry_daily_role.name, "member", member)


def delete(enquiry_daily_role):
	frappe.delete_doc("Enquiry Daily Role", enquiry_daily_role.name, ignore_permissions=True)


def delete_by_enquiry(enquiry):
	frappe.db.delete("Enquiry Daily Role", {"enquiry": enquiry})


def on_doctype_update():
	# one Member per Enquiry, Date and Role
	frappe.db.add_unique("Enquiry Daily Role", ["enquiry", "date", "role"])
