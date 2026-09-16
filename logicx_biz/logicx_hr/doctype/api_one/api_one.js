frappe.ui.form.on("API One", {

	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("View Logs"), () => {
				frappe.set_route("List", "API One Log", { api_path: frm.doc.api_path });
			});
		}
	},

	api_path(frm) {
		if (frm.doc.api_path) {
			frm.set_value("api_path", frm.doc.api_path.trim());
		}
	},

});
