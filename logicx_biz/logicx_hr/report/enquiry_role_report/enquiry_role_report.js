frappe.query_reports["Enquiry Role Report"] = {
	filters: [
		{
			fieldname: "date",
			label: __("Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			on_change: (report) => frappe.query_reports["Enquiry Role Report"].on_filter_change(report),
		},
		{
			fieldname: "member",
			label: __("Member"),
			fieldtype: "Link",
			options: "Employee",
			on_change: (report) => frappe.query_reports["Enquiry Role Report"].on_filter_change(report),
		},
	],

	onload(report) {
		// runs after the filters are set and before the first refresh
		this.require_date_or_member(report);
	},

	on_filter_change(report) {
		this.require_date_or_member(report);
		// a filter's on_change stands in for the report's own refresh, which
		// skips while route options are being set
		if (!report._no_refresh) {
			report.refresh(true);
		}
	},

	require_date_or_member(report) {
		// Date or Member, either one will do; with both empty, both turn mandatory,
		// so the report asks for one ("Please set filters") rather than fetching
		const reqd = !report.get_filter_value("date") && !report.get_filter_value("member") ? 1 : 0;
		for (const fieldname of ["date", "member"]) {
			const filter = report.get_filter(fieldname);
			filter.df.reqd = reqd;
			filter.refresh();
		}
	},
};
