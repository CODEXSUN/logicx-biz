frappe.query_reports["Enquiry List-In wise Status"] = {
	formatter: function (value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (column.fieldname === "total") {
			value = `<b>${value}</b>`;
		}
		if (column.fieldname === "group" && data && data.group === __("(no group)")) {
			value = `<span style="color: var(--red-500, red)">${value}</span>`;
		}
		return value;
	},
	filters: [
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
		},
		{
			fieldname: "assigned_to_employee",
			label: __("Assigned To"),
			fieldtype: "Link",
			options: "Employee",
		},
	],
};
