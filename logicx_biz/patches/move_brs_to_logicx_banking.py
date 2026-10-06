"""Move BRS Transaction, BRS Date and the BRS Dashboard from LogicX HR to LogicX Banking.

Their files moved from logicx_hr/ to logicx_banking/ alongside this patch, and
modules.txt lists the new module. Two things migrate's own sync does not do for a
site that already has them, done here before it runs (pre_model_sync):

- create the module's Module Def. An app's modules get theirs when the app is
  installed -- and a fresh install never runs this patch -- but a module added to
  an app already installed gets none on migrate.
- point the three records at the new module. Frappe finds a DocType's controller
  and a Page's script through the module on the record, so until the sync imports
  them again they look for their files under logicx_hr/, where there are none
  now. The sync does import a DocType again when its JSON has changed, and a Page
  when its JSON is newer than the record; but after the sync, migrate deletes any
  DocType whose controller cannot be imported, as an orphan. Setting the module
  first leaves none of that to chance.
"""

import frappe

MODULE = "LogicX Banking"
APP_NAME = "logicx_biz"

MOVED = (
	("DocType", "BRS Transaction"),
	("DocType", "BRS Date"),
	("Page", "brs-dashboard"),
)


def execute():
	if not frappe.db.exists("Module Def", MODULE):
		frappe.get_doc({"doctype": "Module Def", "module_name": MODULE, "app_name": APP_NAME}).insert(
			ignore_permissions=True
		)

	for doctype, name in MOVED:
		if frappe.db.exists(doctype, name):
			# the record keeps the timestamp it was imported with, so the sync still
			# reads the moved JSON as the newer of the two
			frappe.db.set_value(doctype, name, "module", MODULE, update_modified=False)
