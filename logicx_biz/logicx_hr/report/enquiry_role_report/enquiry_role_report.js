frappe.query_reports["Enquiry Role Report"] = {
	filters: [
		{
			fieldname: "member",
			label: __("Member"),
			fieldtype: "Link",
			options: "Employee",
		},
	],
};
