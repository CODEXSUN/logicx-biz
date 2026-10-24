frappe.ui.form.on("Enquiry", {

	onload(frm) {
		set_current_employee(frm);
	},

	refresh(frm) {
		set_current_employee(frm);
		init_btn_whatsapp(frm.fields_dict.btn_whatsapp);
	},

	btn_whatsapp(frm, cdt, cdn) {
		whatsapp_open(frm)
	},

});

async function set_current_employee(frm) {
	if (!frm.is_new() || frm.doc.user_employee) {
		return;
	}
	//
	const current_employee = await frappe.xcall("logicx_biz.logicx_hr.doctype.enquiry.enquiry.get_current_employee");
	if (current_employee?.name) {
		frm.set_value("user_employee", current_employee.name);
		frappe.utils.add_link_title("Employee", current_employee.name, current_employee.employee_name);
		await frm.fields_dict.user_employee.set_link_title(current_employee.name);
	}
}

function init_btn_whatsapp(btn_whatsapp) {
	btn_whatsapp.df.label = '<i class="fa fa-whatsapp" style="color:green; margin-right:4px;"></i> WhatsApp';
	btn_whatsapp.refresh();
	//
	let div_btn_whatsapp = $(btn_whatsapp.wrapper);
	div_btn_whatsapp.css({
		"margin-left": "2px"
	});
}

function whatsapp_open(frm) {
	const mobile = frm.doc.mobile || "";
	window.open(`whatsapp://send?phone=91${mobile}&text=`, "_blank");
}
