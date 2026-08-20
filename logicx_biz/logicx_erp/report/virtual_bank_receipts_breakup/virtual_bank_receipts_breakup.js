frappe.query_reports["Virtual Bank Receipts Breakup"] = {
	filters: [
		{
			fieldname: "posting_date",
			label: __("Posting Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_days(frappe.datetime.get_today(), -1),
			reqd: 1,
		},
		{
			fieldname: "mode_of_payment",
			label: __("Mode of Payment"),
			fieldtype: "Link",
			options: "Mode of Payment",
		},
		{
			fieldname: "party",
			label: __("Party"),
			fieldtype: "Link",
			options: "Customer",
		},
	],
};
