// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

frappe.ui.form.on("Job Comments", {

	refresh(frm) {
		init_btn_whatsapp(frm.fields_dict.btn_whatsapp);
	},

	btn_whatsapp(frm) {
		whatsapp_send(frm);
	},

});

function init_btn_whatsapp(btn_whatsapp) {
	btn_whatsapp.df.label = '<i class="fa fa-whatsapp" style="color:green; margin-right:4px;"></i> WhatsApp';
	btn_whatsapp.refresh();
	//
	let div_btn_whatsapp = $(btn_whatsapp.wrapper);
	div_btn_whatsapp.css({
		"margin-left": "2px"
	});
}

async function whatsapp_send(frm) {
	// the mobile number is on the Enquiry, not on the comment
	const { message } = await frappe.db.get_value("Enquiry", frm.doc.enquiry, "mobile");
	const mobile = message?.mobile || "";
	const comment = frm.doc.comment || "";
	window.open(`whatsapp://send?phone=91${mobile}&text=${encodeURIComponent(comment)}`, "_blank");
}
