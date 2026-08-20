frappe.ui.form.on("Customer", {
	refresh(frm) {
		if (frm.is_new()) {
			return;
		}
		frm.add_custom_button(__("Set Mobile / Email"), () => show_contact_info_dialog(frm));
	},
});

function show_contact_info_dialog(frm) {
	const dialog = new frappe.ui.Dialog({
		title: __("Set Mobile / Email"),
		fields: [
			{
				fieldname: "mobile_no",
				label: __("Mobile No"),
				fieldtype: "Data",
				options: "Phone",
				default: frm.doc.mobile_no,
			},
			{
				fieldname: "email_id",
				label: __("Email ID"),
				fieldtype: "Data",
				options: "Email",
				default: frm.doc.email_id,
			},
		],
		primary_action_label: __("Update"),
		primary_action(values) {
			if (!values.mobile_no && !values.email_id) {
				frappe.msgprint(__("Please enter a Mobile No or an Email ID."));
				return;
			}
			if (values.mobile_no && !/^\d{10}$/.test(values.mobile_no.trim())) {
				frappe.msgprint(__("Mobile No must contain exactly 10 digits (numbers only)."));
				return;
			}
			frappe
				.call({
					method: "logicx_biz.logicx_erp.customer.update_primary_contact_info",
					args: {
						customer: frm.doc.name,
						mobile_no: values.mobile_no,
						email_id: values.email_id,
					},
					freeze: true,
					freeze_message: __("Updating contact info..."),
				})
				.then((r) => {
					dialog.hide();
					const updated = (r.message && r.message.updated) || [];
					frappe.show_alert({
						message: __("Updated {0}", [updated.join(", ")]),
						indicator: "green",
					});
					frm.reload_doc();
				});
		},
	});
	dialog.show();
}
