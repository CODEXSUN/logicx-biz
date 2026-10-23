// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

frappe.ui.form.on("Duty", {

	refresh: function (frm) {
		add_button_new_duty_reporting();

		function add_button_new_duty_reporting() {
			if (!frm.is_new()) {
				frm.add_custom_button("Duty Reporting", () => {
					frappe.new_doc("Duty Reporting", {
						sop: frm.doc.sop,
						user: frm.doc.user
					});
				});
			}
		}
	}

});
