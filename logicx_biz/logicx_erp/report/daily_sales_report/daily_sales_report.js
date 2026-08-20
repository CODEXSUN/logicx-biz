frappe.query_reports["Daily Sales Report"] = {
	filters: [
		{
			fieldname: "posting_date",
			label: __("Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
		},
		{
			fieldname: "pos_profile",
			label: __("POS Profile"),
			fieldtype: "Link",
			options: "POS Profile",
		},
		{
			fieldname: "sales_person",
			label: __("Sales Person"),
			fieldtype: "Link",
			options: "Sales Person",
		},
		{
			fieldname: "party",
			label: __("Party"),
			fieldtype: "Link",
			options: "Customer",
		},
	],
};
