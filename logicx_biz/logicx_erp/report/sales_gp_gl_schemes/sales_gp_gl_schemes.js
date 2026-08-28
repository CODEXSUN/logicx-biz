(function () {
	frappe.query_reports["Sales GP GL Schemes"] = {
		onload: function (report) {
			add_item_wise_buttons(report);
		},
		filters: [
			{
				fieldname: "from_date",
				label: __("From Date"),
				fieldtype: "Date",
				default: frappe.datetime.get_today()
			},
			{
				fieldname: "to_date",
				label: __("To Date"),
				fieldtype: "Date",
				default: frappe.datetime.get_today()
			},
			{
				fieldname: "customer_code",
				label: __("Customer"),
				fieldtype: "Link",
				options: "Customer"
			},
			{
				fieldname: "sales_person",
				label: __("Sales Person"),
				fieldtype: "Link",
				options: "Sales Person"
			}
		],
		formatter: function (value, row, column, data, default_formatter) {
			if (column.fieldname === "open_item_wise") {
				if (!data || !data.invoice_number) return "";
				const invoice_number = frappe.utils.escape_html(data.invoice_number);
				return (
					'<button type="button" class="btn btn-xs btn-default open-item-wise-btn" ' +
					'data-invoice-number="' + invoice_number + '">' +
					__("Item-wise") +
					"</button>"
				);
			}
			return default_formatter(value, row, column, data);
		},
	};

	function add_item_wise_buttons(report) {
		// delegated so it survives the datatable re-rendering rows on every
		// refresh/filter change -- bind once against the page wrapper, which
		// persists for the life of the report
		report.page.wrapper.on("click", ".open-item-wise-btn", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const invoice_number = $(this).attr("data-invoice-number");
			if (!invoice_number) return;
			// from_date/to_date apply to the whole report, not to individual
			// invoices, so carry over whatever is currently set here rather
			// than reading them off the row
			frappe.route_options = {
				from_date: frappe.query_report.get_filter_value("from_date"),
				to_date: frappe.query_report.get_filter_value("to_date"),
				invoice_number: invoice_number,
			};
			frappe.set_route("query-report", "Sales Item-wise GP GL Schemes");
		});
	}
})();
