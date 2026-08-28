(function () {
	frappe.query_reports["Party Outstanding"] = {
		onload: function (report) {
			wrap_column_headers(report);
			add_party_statement_action(report);
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
		get_datatable_options: function (options) {
			// adds the row-selection checkbox column; the onCheckRow hook below
			// drives the "Open Party Statement" action's enabled state
			return Object.assign({}, options, {
				checkboxColumn: true,
				events: Object.assign({}, options.events, {
					onCheckRow: function () {
						update_party_statement_action();
					},
				}),
			});
		},
		after_datatable_render: function () {
			// every (re)render starts with nothing checked, so the action goes back
			// to disabled until the user checks exactly one row again
			update_party_statement_action();
		},
	};


	const ROUTE = "Party Outstanding";
	const HEADER_WRAP_CLASS = "logicx-wrap-headers";
	const HEADER_HEIGHT_INCREASE = "15px";
	const FILTER_ROWS_INCREASE = `${0 * 40}px`;

	// set once from onload; kept in module scope so the row-selection helpers
	// below can reach the current report/button without relying on how frappe
	// binds `this` inside the query_report config hooks
	let current_report = null;
	let action_button = null;

	function add_party_statement_action(report) {
		current_report = report;
		action_button = report.page.add_inner_button(__("Open Party Statement"), function () {
			open_party_statement();
		});
		update_party_statement_action();
	}

	function get_checked_rows() {
		if (!current_report || !current_report.datatable || !current_report.datatable.rows) {
			return [];
		}
		// frappe's QueryReport exposes get_checked_items() as a thin wrapper around
		// datatable.rows.getCheckedRows(); fall back to the raw datatable call in
		// case it's ever missing, and map its row indexes back to report.data,
		// which is where party_type/party for each row actually live
		if (typeof current_report.get_checked_items === "function") {
			return current_report.get_checked_items();
		}
		const indexes = current_report.datatable.rows.getCheckedRows() || [];
		return indexes.map((i) => current_report.data[i]).filter(Boolean);
	}

	function update_party_statement_action() {
		if (!action_button) return;
		const checked = get_checked_rows();
		action_button.prop("disabled", checked.length !== 1);
	}

	function open_party_statement() {
		const checked = get_checked_rows();
		if (checked.length !== 1) return;

		const row = checked[0];
		// route_options is applied against Party Statement's own filters in
		// declaration order (party_type, then party), so by the time its
		// party_type on_change clears party (see above) and defers its refresh,
		// party has already been re-set to our value -- same deferred-refresh
		// trick this report's own on_change relies on
		frappe.route_options = {
			party_type: row.party_type,
			party: row.party,
		};
		frappe.set_route("query-report", "Party Statement");
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
