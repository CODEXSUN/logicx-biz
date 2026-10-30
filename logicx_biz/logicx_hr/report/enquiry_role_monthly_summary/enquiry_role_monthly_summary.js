frappe.query_reports["Enquiry Role Monthly Summary"] = {
	filters: [
		{
			fieldname: "member",
			label: __("Member"),
			fieldtype: "Link",
			options: "Employee",
		},
	],
};
