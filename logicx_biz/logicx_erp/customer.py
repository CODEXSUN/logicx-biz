import frappe
from frappe import _
from frappe.utils import validate_email_address
from logicx_biz.logicx_erp.mobile_validation import validate_mobile_number


@frappe.whitelist()
def update_primary_contact_info(customer: str, mobile_no: str | None = None, email_id: str | None = None):
	"""Update mobile no / email on the Customer, its primary Address and its primary Contact.

	Blank values are left unchanged. The Contact is updated first because
	Customer.mobile_no / email_id are read-only fields fetched from
	customer_primary_contact; the Customer copies are then written with
	db_set, same as ERPNext's Customer.create_primary_contact.
	"""
	mobile_no = (mobile_no or "").strip()
	email_id = (email_id or "").strip()

	if not (mobile_no or email_id):
		frappe.throw(_("Please enter a Mobile No or an Email ID."))
	if email_id:
		validate_email_address(email_id, throw=True)
	if mobile_no:
		validate_mobile_number(mobile_no)

	doc = frappe.get_doc("Customer", customer)
	doc.check_permission("write")

	updated = []

	contact_name = _update_primary_contact(doc, mobile_no, email_id)
	if contact_name:
		updated.append(_("Contact {0}").format(contact_name))

	if doc.customer_primary_address:
		address = frappe.get_doc("Address", doc.customer_primary_address)
		if mobile_no:
			address.phone = mobile_no
		if email_id:
			address.email_id = email_id
		address.save(ignore_permissions=True)
		updated.append(_("Address {0}").format(address.name))

	values = {}
	if mobile_no:
		values["mobile_no"] = mobile_no
	if email_id:
		values["email_id"] = email_id
	doc.db_set(values)
	updated.insert(0, _("Customer {0}").format(doc.name))

	return {"updated": updated}


def _update_primary_contact(doc, mobile_no: str, email_id: str) -> str | None:
	if not doc.customer_primary_contact:
		# no primary contact yet — create one the same way core does on save
		# (core skips lead-linked customers, so do we)
		if doc.lead_name:
			return None
		from erpnext.selling.doctype.customer.customer import make_contact

		doc.mobile_no = mobile_no
		doc.email_id = email_id
		doc.flags.ignore_permissions = True
		contact = make_contact(doc)
		doc.db_set("customer_primary_contact", contact.name)
		return contact.name

	contact = frappe.get_doc("Contact", doc.customer_primary_contact)

	if email_id:
		row = next(
			(r for r in contact.email_ids if (r.email_id or "").strip().lower() == email_id.lower()),
			None,
		)
		for r in contact.email_ids:
			r.is_primary = 0
		if not row:
			row = contact.append("email_ids", {"email_id": email_id})
		row.is_primary = 1

	if mobile_no:
		row = next((r for r in contact.phone_nos if (r.phone or "").strip() == mobile_no), None)
		for r in contact.phone_nos:
			r.is_primary_mobile_no = 0
		if not row:
			row = contact.append("phone_nos", {"phone": mobile_no})
		row.is_primary_mobile_no = 1

	# Contact.validate recomputes contact.email_id / mobile_no from the child rows
	contact.save(ignore_permissions=True)
	return contact.name
