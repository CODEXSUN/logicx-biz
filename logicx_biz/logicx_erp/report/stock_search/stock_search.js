(function () {
	frappe.query_reports["Stock Search"] = {
		onload: function (report) {
			apply_search_on_enter(report);
		},
		// formatter: function (value, row, column, data, default_formatter) {
		// 	const html = default_formatter(value, row, column, data);
		// 	// item_name has no column of its own, so show it next to the item link
		// 	if (column.fieldname === "item_code" && data && data.item_name) {
		// 		return `${html} ${frappe.utils.escape_html(data.item_name)}`;
		// 	}
		// 	return html;
		// },
		filters: [
			{
				fieldname: "search_text",
				label: __("Search"),
				fieldtype: "Data",
				placeholder: __("Name | Group | Brand | Description"),
				on_change: () => {}, // a no-op on_change makes the query-report page skip its own refresh for this filter; apply_search_on_enter() runs it on Enter instead of on every keystroke
			},
			{
				fieldname: "in_stock_only",
				label: __("In Stock only"),
				fieldtype: "Check",
				default: 1,
			},
			// {
			// 	fieldname: "item_group",
			// 	label: __("Item Group"),
			// 	fieldtype: "Link",
			// 	options: "Item Group",
			// },
			// {
			// 	fieldname: "brand",
			// 	label: __("Brand"),
			// 	fieldtype: "Link",
			// 	options: "Brand",
			// },
		],
	};


	const SEARCH_FIELD = "search_text";

	function apply_search_on_enter(report) {
		// frappe's Data control fires a change 500ms after the last keystroke, which re-queries the report on every half-typed search term;
		// the filter's no-op on_change suppresses that, so run the report here
		const filter = report.get_filter(SEARCH_FIELD);
		if (!filter) return;

		// setup_filters() rebuilds the controls before every onload, so this handler cannot stack up across report loads
		filter.$input.on("keydown", function (e) {
			if (e.key !== "Enter") return;
			e.preventDefault();
			// get_filter_values() reads the input element directly, so the typed text is picked up even before its change event fires
			report.refresh(true);
		});
	}

})();
