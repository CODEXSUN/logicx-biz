frappe.query_reports["Enquiry Role Daily Report"] = {
	filters: [
		{
			fieldname: "date",
			label: __("Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
		},
		{
			fieldname: "member",
			label: __("Member"),
			fieldtype: "Link",
			options: "Employee",
		},
	],
};
