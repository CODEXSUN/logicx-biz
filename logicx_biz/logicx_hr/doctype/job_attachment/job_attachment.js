// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

frappe.ui.form.on("Job Attachment", {

	onload(frm) {
		set_current_employee(frm);
	},

	document(frm) {
		frm.refresh_field("preview");
		// The Attach control saves the form as soon as the upload finishes, so tick "Is Photo" before that save.
		// It can still be unticked afterwards, e.g. for a scanned document.
		return frm.set_value("is_photo", frappe.utils.is_image_file(frm.doc.document) ? 1 : 0);
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
