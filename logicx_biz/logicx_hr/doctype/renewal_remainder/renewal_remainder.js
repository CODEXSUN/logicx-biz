// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

frappe.ui.form.on('Renewal Remainder', {

	refresh: function (frm) {
		add_button_new_renewal_entry();

		function add_button_new_renewal_entry() {
			if (!frm.is_new()) {
				frm.add_custom_button("Renewal Entry", () => {
					frappe.new_doc("Renewal Entry", {
						renewal_remainder: frm.doc.name,
						quantity: frm.doc.quantity,
						rate: frm.doc.rate,
						renewal_value: frm.doc.renewal_value,
					});
				});
			}
		}
	},

	quantity: function (frm) {
		calc_renewal_value(frm);
	},

	rate: function (frm) {
		calc_renewal_value(frm);
	},

});

function calc_renewal_value(frm) {
    let qty = frm.doc.quantity || 0;
    let rate = frm.doc.rate || 0;
    frm.set_value('renewal_value', qty * rate);
}
