// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

frappe.ui.form.on("SOP Item", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button("SOP Reporting", () => {
				let current_user = frappe.session.user;
				frappe.db.get_value('Employee',
					{ user_id: current_user },
					'name',
					(employee_doc) => {
						if (employee_doc && employee_doc.name) {
							let current_employee = employee_doc.name;
							frappe.new_doc("SOP Reporting", {
								sop_item: frm.doc.name,
								user: current_employee
							});
						}
					}
				);
			});
		}
	}
});
