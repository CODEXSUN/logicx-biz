import frappe
from frappe import _
from frappe.utils import sanitize_html

no_cache = 1

# only these fields are ever exposed to guests
PUBLIC_FIELDS = [
	"item_code",
	"item_name",
	"item_group",
	"brand",
	"stock_uom",
	"description",
	"image",
	"disabled",
]


def get_context(context):
	item_id = frappe.form_dict.item_id

	if not item_id:
		frappe.throw(_("Item Id is required"), frappe.DoesNotExistError)

	item = frappe.db.get_value("Item", item_id, PUBLIC_FIELDS, as_dict=True)

	if not item or item.disabled:
		frappe.throw(_("Item {0} not found").format(item_id), frappe.DoesNotExistError)

	# guests cannot access private files
	if item.image and item.image.startswith("/private/"):
		item.image = None

	item.description = sanitize_html(item.description or "")

	context.item = item
	context.title = item.item_name or item.item_code
	return context
