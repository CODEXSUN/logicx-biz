frappe.query_reports["Enquiry Role Monthly Report"] = {
	filters: [
		{
			fieldname: "year",
			label: __("Year"),
			fieldtype: "Int",
			// get_today is "YYYY-MM-DD" in the system's time zone
			default: cint(frappe.datetime.get_today().split("-")[0]),
			reqd: 1,
		},
		{
			fieldname: "month",
			label: __("Month"),
			fieldtype: "Select",
			options: [
				{ value: "1", label: __("January") },
				{ value: "2", label: __("February") },
				{ value: "3", label: __("March") },
				{ value: "4", label: __("April") },
				{ value: "5", label: __("May") },
				{ value: "6", label: __("June") },
				{ value: "7", label: __("July") },
				{ value: "8", label: __("August") },
				{ value: "9", label: __("September") },
				{ value: "10", label: __("October") },
				{ value: "11", label: __("November") },
				{ value: "12", label: __("December") },
			],
			default: String(cint(frappe.datetime.get_today().split("-")[1])),
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
