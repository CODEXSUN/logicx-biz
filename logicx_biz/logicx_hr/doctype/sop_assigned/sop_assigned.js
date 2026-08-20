// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

frappe.ui.form.on("SOP Assigned", {

	refresh: function (frm) {
		add_button_new_sop_reporting();

		function add_button_new_sop_reporting() {
			if (!frm.is_new()) {
				frm.add_custom_button("SOP Reporting", () => {
					frappe.new_doc("SOP Reporting", {
						sop_item: frm.doc.sop_item,
						user: frm.doc.user
					});
				});
			}
		}
	}

});
