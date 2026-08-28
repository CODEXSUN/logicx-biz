(function () {
	frappe.query_reports["Virtual Bank Receipts Summary"] = {
		onload: function (report) {
			add_breakup_buttons(report);
		},
		filters: [
			{
				fieldname: "posting_date",
				label: __("Posting Date"),
				fieldtype: "Date",
				default: frappe.datetime.add_days(frappe.datetime.get_today(), -1),
				reqd: 1,
			},
		],
		formatter: function (value, row, column, data, default_formatter) {
			if (column.fieldname === "open_breakup") {
				if (!data || !data.mode_of_payment) return "";
				const mode_of_payment = frappe.utils.escape_html(data.mode_of_payment);
				return (
					'<button type="button" class="btn btn-xs btn-default open-breakup-btn" ' +
					'data-mode-of-payment="' + mode_of_payment + '">' +
					__("Breakup") +
					"</button>"
				);
			}
			return default_formatter(value, row, column, data);
		},
	};

	function add_breakup_buttons(report) {
		// delegated so it survives the datatable re-rendering rows on every
		// refresh/filter change -- bind once against the page wrapper, which
		// persists for the life of the report
		report.page.wrapper.on("click", ".open-breakup-btn", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const mode_of_payment = $(this).attr("data-mode-of-payment");
			if (!mode_of_payment) return;
			// posting_date isn't a per-row field here (it's this report's own
			// mandatory filter, applied identically to every row), so read it
			// live off the current report rather than off the clicked row
			const posting_date = frappe.query_report.get_filter_value("posting_date");
			frappe.route_options = {
				posting_date: posting_date,
				mode_of_payment: mode_of_payment,
			};
			frappe.set_route("query-report", "Virtual Bank Receipts Breakup");
		});
	}
})();
