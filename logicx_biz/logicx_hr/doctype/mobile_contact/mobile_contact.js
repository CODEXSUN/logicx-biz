frappe.ui.form.on("Mobile Contact", {

	mobile_number(frm) {
		if (frm.doc.mobile_number) {
			frm.set_value("mobile_number", frm.doc.mobile_number.trim());
		}
	},

});
