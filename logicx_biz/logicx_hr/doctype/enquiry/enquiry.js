frappe.ui.form.on("Enquiry", {

	onload(frm) {
		set_current_employee(frm);
		init_messages_grid_row_behavior(frm);
	},

	refresh(frm) {
		set_current_employee(frm);
		init_messages_grid_row_behavior(frm);
		init_btn_whatsapp(frm.fields_dict.btn_whatsapp);
	},

	mobile(frm) {
		if (frm.doc.mobile) {
			frm.set_value("mobile", frm.doc.mobile.trim());
		}
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

// ---- [Child] Messages ---------------------------------------------------------------------------------------------------------------------------

frappe.ui.form.on("Enquiry Message", {

	form_render(frm, cdt, cdn) {
		const grid_row = frm.fields_dict.enquiry_messages.grid.get_row(cdn);
		const grid_form = grid_row.grid_form;
		init_btn_whatsapp(grid_form.fields_dict.btn_whatsapp);
	},

	btn_whatsapp(frm, cdt, cdn) {
		const grid_row = locals[cdt]?.[cdn];
		whatsapp_send(frm, grid_row)
	},

	comment(frm) {
		resize_messages_grid_rows(frm);
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

function whatsapp_send(frm, grid_row) {
	const mobile = frm.doc.mobile || "";
	const comment = grid_row.comment || "";
	window.open(`whatsapp://send?phone=91${mobile}&text=${encodeURIComponent(comment)}`, "_blank");
}

function whatsapp_open(frm) {
	const mobile = frm.doc.mobile || "";
	window.open(`whatsapp://send?phone=91${mobile}&text=`, "_blank");
}

let messages_grid_style_added = false;

function init_messages_grid_row_behavior(frm) {
	const grid = frm.fields_dict.enquiry_messages?.grid;
	if (!grid) {
		return;
	}

	if (!messages_grid_style_added) {
		frappe.dom.set_style(`
			.enquiry-message-grid .grid-row > .data-row {
				height: auto !important;
				min-height: 34px;
			}

			.enquiry-message-grid .grid-row .grid-static-col {
				height: auto !important;
				min-height: 34px;
			}

			.enquiry-message-grid .grid-row .static-area,
			.enquiry-message-grid .grid-row .ellipsis {
				overflow: visible !important;
				text-overflow: clip !important;
				white-space: pre-wrap !important;
				word-break: break-word;
			}
		`);
		messages_grid_style_added = true;
	}

	grid.wrapper.addClass("enquiry-message-grid");
	if (grid._enquiry_message_auto_height_setup) {
		resize_messages_grid_rows(frm);
		return;
	}

	grid.refresh = ((refresh) => function () {
		refresh.apply(this, arguments);
		resize_messages_grid_rows(frm);
	})(grid.refresh);
	grid._enquiry_message_auto_height_setup = true;
	resize_messages_grid_rows(frm);
}

function resize_messages_grid_rows(frm) {
	const grid = frm?.fields_dict.enquiry_messages?.grid;
	if (!grid) {
		return;
	}

	setTimeout(() => {
		grid.wrapper.find(".grid-row, .data-row, .grid-static-col").css("height", "auto");
	}, 0);
}
