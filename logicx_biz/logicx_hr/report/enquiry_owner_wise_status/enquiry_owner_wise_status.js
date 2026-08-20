frappe.query_reports["Enquiry Owner wise Status"] = {
	formatter: function (value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (column.fieldname === "total") {
			value = `<b>${value}</b>`;
		}
		if (column.fieldname === "assigned_to" && data && data.assigned_to === __("(unassigned)")) {
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
			fieldname: "group",
			label: __("List in"),
			fieldtype: "Select",
			options: "\nStores\nDELL\nASUS\nSpares\nMBO\nService\nOn-site\nRemote - AnyDesk\nFollow\nAdmin",
		},
	],
};
