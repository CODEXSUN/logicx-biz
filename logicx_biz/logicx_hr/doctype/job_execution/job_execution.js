// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

frappe.ui.form.on('Job Execution', {

	date: function (frm) {
		calc_hours(frm);
	},

	start_time: function (frm) {
		calc_hours(frm);
	},

	stop_date: function (frm) {
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
		if (frm.doc.date && frm.doc.stop_date) {
			start = moment(`${frm.doc.date} ${frm.doc.start_time}`, 'YYYY-MM-DD HH:mm:ss');
			stop = moment(`${frm.doc.stop_date} ${frm.doc.stop_time}`, 'YYYY-MM-DD HH:mm:ss');
		} else if (stop.isBefore(start)) {
			// no Stop Date: a Stop Time before the Start Time is taken as the next day
			stop.add(1, 'days');
		}
		let minutes = stop.diff(start, 'minutes', true);
		// to the nearest half hour (0.5, 1, 1.5, ...), except that 1m to 44m is 0.5, as the server does
		let hours = Math.round(minutes / 30) / 2;
		if (!hours && minutes >= 1) {
			hours = 0.5;
		}
		frm.set_value('hours', hours);
	}
}

function calc_total_cost(frm) {
	let hours = frm.doc.hours || 0;
	let cost_per_hour = frm.doc.employee_cost_per_hour || 0;
	frm.set_value('total_cost', flt(hours * cost_per_hour, 2));
}
