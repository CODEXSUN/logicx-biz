frappe.query_reports["Virtual Bank Receipts Summary"] = {
	filters: [
		{
			fieldname: "posting_date",
			label: __("Posting Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_days(frappe.datetime.get_today(), -1),
			reqd: 1,
		},
	],
};
