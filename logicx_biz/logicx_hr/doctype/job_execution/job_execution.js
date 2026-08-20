// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

frappe.ui.form.on('Job Execution', {

	start_time: function (frm) {
		calc_hours(frm);
	},

	stop_time: function (frm) {
		calc_hours(frm);
	},

	hours: function (frm) {
		calc_total_cost(frm);
	},

	employee_cost_per_hour: function (frm) {
		calc_total_cost(frm);
	},

});

function calc_hours(frm) {
	if (frm.doc.start_time && frm.doc.stop_time) {
		let start = moment(frm.doc.start_time, 'HH:mm:ss');
		let stop = moment(frm.doc.stop_time, 'HH:mm:ss');
		if (stop.isBefore(start)) {
			stop.add(1, 'days');
		}
		let hours = moment.duration(stop.diff(start)).asHours();
		frm.set_value('hours', flt(hours, 2));
	}
}

function calc_total_cost(frm) {
	let hours = frm.doc.hours || 0;
	let cost_per_hour = frm.doc.employee_cost_per_hour || 0;
	frm.set_value('total_cost', flt(hours * cost_per_hour, 2));
}
