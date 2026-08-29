(function () {
	frappe.query_reports["Party Not Reconciled"] = {
		onload: function (report) {
			wrap_column_headers(report);
			add_statement_buttons(report);
		},
		filters: [
			{
				fieldname: "party_type",
				label: __("Party Type"),
				fieldtype: "Select",
				options: "Customer\nSupplier",
				default: "Customer",
				on_change: function (report) {
					// defining on_change replaces frappe's default filter handler, which
					// is what reloads the report, so clear the party (it belongs to the
					// previous party type) and reload by hand. the reload is deferred so
					// the cleared party is in place before it runs, and _no_refresh
					// swallows the reload that clearing the party triggers on its own
					report._no_refresh = true;
					report.set_filter_value("party", "");
					setTimeout(function () {
						report._no_refresh = false;
						report.refresh();
					}, 0);
				},
			},
			{
				fieldname: "party",
				label: __("Party"),
				fieldtype: "Dynamic Link",
				options: "party_type",
				get_options: function () {
					return frappe.query_report.get_filter_value("party_type") || "Customer";
				},
			},
		],
		formatter: function (value, row, column, data, default_formatter) {
			if (column.fieldname === "open_statement") {
				if (!data || !data.party_type || !data.party) return "";
				const party_type = frappe.utils.escape_html(data.party_type);
				const party = frappe.utils.escape_html(data.party);
				return render_statement_buttons(party_type, party);
			}
			return default_formatter(value, row, column, data);
		},
	};


	const ROUTE = "Party Not Reconciled";
	const HEADER_WRAP_CLASS = "logicx-wrap-headers";
	const HEADER_HEIGHT_INCREASE = "15px";
	const FILTER_ROWS_INCREASE = `${0 * 40}px`;

	// two per-row buttons in the one HTML cell, laid out left to right: "Statement"
	// hands off to Party Statement, "Bill-wise" to Party Bill-wise Statement. Both
	// carry the row's own party_type/party on data- attributes for the delegated
	// click handlers in add_statement_buttons() to route with.
	function render_statement_buttons(party_type, party) {
		return (
			'<button type="button" class="btn btn-xs btn-default open-statement-btn" ' +
			'data-party-type="' + party_type + '" data-party="' + party + '">' +
			__("Statement") +
			"</button>" +
			'<button type="button" class="btn btn-xs btn-default open-bill-wise-btn" ' +
			'style="margin-left:4px" ' +
			'data-party-type="' + party_type + '" data-party="' + party + '">' +
			__("Bill-wise") +
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
			const $btn = $(this);
			const party_type = $btn.attr("data-party-type");
			const party = $btn.attr("data-party");
			if (!party_type || !party) return;
			open_report_in_new_tab("Party Statement", party_type, party);
		});

		report.page.wrapper.on("click", ".open-bill-wise-btn", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const $btn = $(this);
			const party_type = $btn.attr("data-party-type");
			const party = $btn.attr("data-party");
			if (!party_type || !party) return;
			open_report_in_new_tab("Party Bill-wise Statement", party_type, party);
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
