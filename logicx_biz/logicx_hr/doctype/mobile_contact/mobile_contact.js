frappe.ui.form.on("Mobile Contact", {

	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Customers"), () => {
				frappe.set_route("List", "Mobile Contact Customer", { mobile_contact: frm.doc.name });
			});
		}
	},

	mobile_number(frm) {
		if (frm.doc.mobile_number) {
			frm.set_value("mobile_number", frm.doc.mobile_number.trim());
		}
	},

});
