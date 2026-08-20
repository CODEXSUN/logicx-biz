"""
GOAL: opening the "LogicX ERP Home" workspace must show the curated "LogicX ERP" sidebar.

PBM: Frappe "auto-generates sidebars" for (Home) Workspaces (i.e. auto_generate_sidebar_from_module() gets invoked)

FIX:
1. `frappe.utils.install.auto_generate_icons_and_sidebar` (core `after_app_install`
   hook, runs on every app install) saves a Workspace Sidebar titled after each
   public workspace (e.g. "LogicX ERP Home"). The desk resolves the sidebar for a
   workspace route by that exact name first, so the auto record wins over the
   standard "LogicX ERP" sidebar.

2. `auto_generate_sidebar_from_module` builds an unsaved per-module sidebar unless
   a sidebar named exactly like the module exists with `for_user IS NULL`; a row
   with `for_user = ''` fails that check. The result is `@site_cache`d per process
   (no TTL) and overwrites the standard sidebar's entry in the boot map.

`cleanup_shadow_sidebars` repairs the data (hooked to install/migrate events);
`extend_bootinfo` repairs the boot payload when a worker still holds a stale cache.
"""

import frappe

APP_NAME = "logicx_biz"


def cleanup_shadow_sidebars(app_name: str | None = None):
	"""Delete auto-generated shadow sidebars and normalize the standard ones.

	Idempotent; runs after install/migrate of any app so shadows recreated by
	frappe's own `after_app_install` hook are removed in the same event.
	"""
	workspace_names = frappe.get_all("Workspace", filters={"app": APP_NAME, "public": 1}, pluck="name")

	if workspace_names:
		shadows = frappe.get_all(
			"Workspace Sidebar",
			filters={
				"title": ["in", workspace_names],
				"standard": 0,
				"app": ["is", "not set"],
				"for_user": ["is", "not set"],
			},
			pluck="name",
		)
		for name in shadows:
			frappe.delete_doc("Workspace Sidebar", name, force=True, ignore_missing=True)

	# for_user must be SQL NULL, not '': auto_generate_sidebar_from_module only
	# skips a module when {"name": module, "for_user": None} (IS NULL) matches
	sidebar = frappe.qb.DocType("Workspace Sidebar")
	(
		frappe.qb.update(sidebar)
		.set(sidebar.for_user, None)
		.where((sidebar.standard == 1) & (sidebar.app == APP_NAME) & (sidebar.for_user == ""))
	).run()

	_clear_module_sidebar_cache()


def extend_bootinfo(bootinfo):
	"""Rebuild the boot sidebar map if an auto module sidebar shadows ours.

	A worker whose `@site_cache` was populated before the standard sidebars were
	synced keeps emitting the auto-generated ones until restart; detect the
	mismatch and rebuild from the database using frappe's own builder.
	"""
	standard = frappe.get_all(
		"Workspace Sidebar",
		filters={"app": APP_NAME, "standard": 1},
		fields=["name", "header_icon"],
	)
	if not standard:
		return

	def shadowed(sidebar_map):
		# only entries taken over by another sidebar count; a missing key means
		# the user simply has no permitted items in it
		return [
			s.name
			for s in standard
			if (entry := (sidebar_map or {}).get(s.name.lower()))
			and entry.get("header_icon") != s.header_icon
		]

	if not shadowed(bootinfo.get("workspace_sidebar_item")):
		return

	from frappe.boot import get_sidebar_items

	_clear_module_sidebar_cache()
	allowed_pages = [d.name for d in bootinfo.workspaces.get("pages")]
	bootinfo.workspace_sidebar_item = get_sidebar_items(allowed_pages)

	if leftover := shadowed(bootinfo.workspace_sidebar_item):
		frappe.log_error(
			title="Standard workspace sidebar shadowed",
			message=(
				f"Auto-generated module sidebars still shadow {leftover} after a "
				"rebuild; run logicx_biz.desk_fixes.cleanup_shadow_sidebars and check "
				"that the standard sidebar names match their Module Def names."
			),
		)


def _clear_module_sidebar_cache():
	from frappe.desk.doctype.workspace_sidebar.workspace_sidebar import (
		auto_generate_sidebar_from_module,
	)

	auto_generate_sidebar_from_module.clear_cache()
