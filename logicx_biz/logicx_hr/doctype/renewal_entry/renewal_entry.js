// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

frappe.ui.form.on('Renewal Entry', {

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
