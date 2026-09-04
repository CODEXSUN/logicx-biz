(function () {
	frappe.query_reports["Stock Search Detailed"] = {
		onload: function (report) {
			wrap_column_headers(report);
			apply_search_on_enter(report);
		},
		filters: [
			{
				fieldname: "from_date",
				label: __("From Date"),
				fieldtype: "Date",
				default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
				reqd: 1,
			},
			{
				fieldname: "to_date",
				label: __("To Date"),
				fieldtype: "Date",
				default: frappe.datetime.get_today(),
				reqd: 1,
			},
			{
				fieldname: "search_text",
				label: __("Search"),
				fieldtype: "Data",
				placeholder: __("Name | Group | Brand | Description"),
				on_change: () => {}, // a no-op on_change makes the query-report page skip its own refresh for this filter; apply_search_on_enter() runs it on Enter instead of on every keystroke
			},
			{
				fieldname: "item_group",
				label: __("Item Group"),
				fieldtype: "Link",
				options: "Item Group",
			},
			{
				fieldname: "brand",
				label: __("Brand"),
				fieldtype: "Link",
				options: "Brand",
			},
			{
				fieldname: "warehouse",
				label: __("Warehouse"),
				fieldtype: "Link",
				options: "Warehouse",
			},
			{
				fieldname: "item_code",
				label: __("Item"),
				fieldtype: "Link",
				options: "Item",
			},
			{
				fieldname: "has_transactions_only",
				label: __("Has In/Out Transactions only"),
				fieldtype: "Check",
				default: 0,
			},
			{
				fieldname: "in_stock_only",
				label: __("In Stock only"),
				fieldtype: "Check",
				default: 1,
			},
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


	const ROUTE = "Stock Search Detailed";
	const HEADER_WRAP_CLASS = "logicx-wrap-headers";
	const HEADER_HEIGHT_INCREASE = "15px";
	const FILTER_ROWS_INCREASE = `${1 * 40}px`; // ceiling(filters.COUNT / 6) - 1 = ceiling(9 / 6) - 1 = 1

	function wrap_column_headers(report) {
		// frappe-datatable truncates header labels with an ellipsis and offers no
		// wrap option, so allow wrapping via CSS scoped to this report's page
		report.page.wrapper.addClass(HEADER_WRAP_CLASS);

		let style = document.getElementById(HEADER_WRAP_CLASS);
		const is_new = !style;
		if (is_new) {
			style = document.createElement("style");
			style.id = HEADER_WRAP_CLASS;
			document.head.appendChild(style);
		}

		// re-set textContent every time (not just on creation) so edits to this
		// file take effect on the next report load, without requiring a hard
		// browser reload to drop the stale <style> tag
		style.textContent = `
			.${HEADER_WRAP_CLASS} .dt-header .dt-row-header {
				height: calc(35px + ${HEADER_HEIGHT_INCREASE}) !important;
			}
			.${HEADER_WRAP_CLASS} .dt-header .dt-row-header .dt-cell--header {
				height: calc(35px + ${HEADER_HEIGHT_INCREASE}) !important;
			}
			.${HEADER_WRAP_CLASS} .dt-header .dt-row-header .dt-cell--header .dt-cell__content {
				white-space: normal !important;
				overflow-wrap: break-word;
				text-overflow: clip;
				height: 100% !important;
				display: flex;
				align-items: flex-end;
			}
			.${HEADER_WRAP_CLASS} .dt-scrollable {
				height: calc(100vh - 240px - ${HEADER_HEIGHT_INCREASE} - ${FILTER_ROWS_INCREASE}) !important;
			}
		`;

		if (!is_new) return;

		// the query-report page is reused across reports, so drop the class when
		// the user switches to a different report without a full page reload
		frappe.router.on("change", function () {
			if ((frappe.get_route() || [])[1] !== ROUTE) {
				$("." + HEADER_WRAP_CLASS).removeClass(HEADER_WRAP_CLASS);
			}
		});
	}

})();
