// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

frappe.ui.form.on("Job Comments", {

	refresh(frm) {
		init_btn_whatsapp(frm.fields_dict.btn_whatsapp);
		set_job_or_mobile(frm);
	},

	job_type(frm) {
		set_mobile(frm);
	},

	job_id(frm) {
		set_mobile(frm);
	},

	mobile(frm) {
		set_job_or_mobile(frm);
	},

	btn_whatsapp(frm) {
		whatsapp_send(frm);
	},

});

async function set_mobile(frm) {
	// same as JobComments.set_mobile, so the form shows it before saving
	set_job_or_mobile(frm);
	// no job: the Mobile is the one entered, and stays
	if (!frm.doc.job_type && !frm.doc.job_id) return;

	let mobile = "";
	if (frm.doc.job_type === "Enquiry" && frm.doc.job_id) {
		const { message } = await frappe.db.get_value("Enquiry", frm.doc.job_id, "mobile");
		mobile = message?.mobile || "";
	}
	frm.set_value("mobile", mobile);
}

// a comment is on a job (Job Type and Job ID both) or, with neither, on a Mobile:
// the rule JobComments.validate_job_or_mobile holds it to. the form marks what is
// needed -- the job until a Mobile is entered, the Mobile while there is no job --
// and a job's Mobile is fetched (see set_mobile), not entered.
function set_job_or_mobile(frm) {
	const has_job = !!(frm.doc.job_type || frm.doc.job_id);
	frm.toggle_reqd(["job_type", "job_id"], has_job || !frm.doc.mobile);
	frm.toggle_reqd("mobile", !has_job);
	frm.set_df_property("mobile", "read_only", has_job ? 1 : 0);
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

function whatsapp_send(frm) {
	// the comment's own Mobile: its Enquiry's, or the one it was given on no job. other
	// Job Types have none, and open WhatsApp without one for the user to pick the contact
	const mobile = frm.doc.mobile || "";
	const comment = frm.doc.comment || "";
	window.open(`whatsapp://send?phone=91${mobile}&text=${encodeURIComponent(comment)}`, "_blank");
}
