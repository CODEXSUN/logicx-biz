frappe.ui.form.on("API One", {

	refresh(frm) {
		show_endpoint(frm);
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
		show_endpoint(frm);
	},

	request_method(frm) {
		show_endpoint(frm);
	},

	enabled(frm) {
		show_endpoint(frm);
	},

});

function show_endpoint(frm) {
	if (!frm.doc.api_path) {
		frm.set_intro("");
		return;
	}
	const endpoint = `${frm.doc.request_method || "GET"} /api/method/${frm.doc.api_path}`;
	const state = frm.doc.enabled ? "" : ` (${__("disabled")})`;
	frm.set_intro(__("Endpoint: {0}{1}", [`<code>${endpoint}</code>`, state]), frm.doc.enabled ? "blue" : "orange");
}