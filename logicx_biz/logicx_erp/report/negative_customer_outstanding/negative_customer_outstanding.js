(function () {
	frappe.query_reports["Negative Customer Outstanding"] = {
		onload: function (report) {
			wrap_column_headers(report);
			add_statement_buttons(report);
		},
		filters: [
			{
				fieldname: "party",
				label: __("Customer"),
				fieldtype: "Link",
				options: "Customer",
			},
		],
		formatter: function (value, row, column, data, default_formatter) {
			if (column.fieldname === "open_statement") {
				if (!data || !data.party) return "";
				const party = frappe.utils.escape_html(data.party);
				return render_statement_buttons(party);
			}
			return default_formatter(value, row, column, data);
		},
	};


	const ROUTE = "Negative Customer Outstanding";
	const HEADER_WRAP_CLASS = "logicx-wrap-headers";
	const HEADER_HEIGHT_INCREASE = "15px";
	const FILTER_ROWS_INCREASE = `${0 * 40}px`;

	// this report only ever lists Customer balances (see get_data()'s
	// party_type = 'Customer' filter), so the buttons below can route with a
	// fixed party_type instead of reading one off the row
	const PARTY_TYPE = "Customer";

	// two per-row buttons in the one HTML cell, laid out left to right: "Statement"
	// hands off to Party Statement, "Bill-wise" to Party Bill-wise Statement
	function render_statement_buttons(party) {
		return (
			'<button type="button" class="btn btn-xs btn-default open-statement-btn" ' +
			'data-party="' + party + '">' +
			__("Statement") +
			"</button>" +
			'<button type="button" class="btn btn-xs btn-default open-bill-wise-btn" ' +
			'style="margin-left:4px" ' +
			'data-party="' + party + '">' +
			__("Bill-wise") +
			"</button>" +
			'<button type="button" class="btn btn-xs btn-default open-dashboard-btn" ' +
			'style="margin-left:4px" ' +
			'data-party="' + party + '">' +
			__("Dashboard") +
			"</button>"
		);
	}

	function add_statement_buttons(report) {
		// delegated so it survives the datatable re-rendering rows on every
		// refresh/filter change -- bind once against the page wrapper, which
		// persists for the life of the report
		report.page.wrapper.on("click", ".open-statement-btn", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const party = $(this).attr("data-party");
			if (!party) return;
			open_report_in_new_tab("Party Statement", PARTY_TYPE, party);
		});

		report.page.wrapper.on("click", ".open-bill-wise-btn", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const party = $(this).attr("data-party");
			if (!party) return;
			open_report_in_new_tab("Party Bill-wise Statement", PARTY_TYPE, party);
		});

		report.page.wrapper.on("click", ".open-dashboard-btn", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const party = $(this).attr("data-party");
			if (!party) return;
			open_party_page(PARTY_TYPE, party);
		});
	}
	// open `report_name` in a new browser tab with the row's party prefilled.
	// frappe.route_options can't survive window.open (a fresh document), so the
	// filters ride along as URL query params instead -- party_type before party,
	// the order the target report's party_type on_change depends on
	function open_report_in_new_tab(report_name, party_type, party) {
		const params = $.param({ party_type: party_type, party: party });
		const url = "/app/query-report/" + encodeURIComponent(report_name) + "?" + params;
		window.open(url, "_blank");
	}

	// unlike the two report buttons above, the dashboard opens in this same tab:
	// it is the overview you drill down from, so the desk router handles it and
	// the browser Back button returns to this report. route_options survives an
	// in-app route change, and party_page reads it on its on_page_show.
	function open_party_page(party_type, party) {
		frappe.route_options = { party_type: party_type, party: party };
		frappe.set_route("party-page");
	}

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
