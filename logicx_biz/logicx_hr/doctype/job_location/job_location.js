// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

frappe.ui.form.on("Job Location", {

	onload(frm) {
		set_current_employee(frm);
	},

	btn_get_location(frm) {
		get_current_location(frm);
	},

});

async function set_current_employee(frm) {
	if (!frm.is_new() || frm.doc.employee) {
		return;
	}
	//
	const current_employee = await frappe.xcall("logicx_biz.logicx_hr.doctype.enquiry.enquiry.get_current_employee");
	if (current_employee?.name) {
		frm.set_value("employee", current_employee.name);
		frappe.utils.add_link_title("Employee", current_employee.name, current_employee.employee_name);
		await frm.fields_dict.employee.set_link_title(current_employee.name);
	}
}

// Fill Latitude / Longitude from the device's GPS, then let the server rebuild the URL and map pin.
// Browsers only share the location on HTTPS (or localhost).
function get_current_location(frm) {
	if (!navigator.geolocation) {
		frappe.msgprint(__("This browser cannot share its location."));
		return;
	}

	frappe.dom.freeze(__("Getting current location..."));
	navigator.geolocation.getCurrentPosition(
		async (position) => {
			try {
				await frm.set_value({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
				});
				await frm.call("set_location_fields");
			} finally {
				frappe.dom.unfreeze();
			}
		},
		(error) => {
			frappe.dom.unfreeze();
			frappe.msgprint(__("Could not get the current location: {0}", [error.message]));
		},
		{ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
	);
}
