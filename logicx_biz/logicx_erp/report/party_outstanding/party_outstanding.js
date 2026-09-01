(function () {
	frappe.query_reports["Party Outstanding"] = {
		onload: function (report) {
			wrap_column_headers(report);
			add_party_statement_action(report);
			add_dashboard_button(report);
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
						enforce_single_checked_row();
						update_party_statement_action();
					},
				}),
			});
		},
		after_datatable_render: function () {
			// every (re)render starts with nothing checked, so the action goes back
			// to disabled until the user checks exactly one row again, and the
			// tracked checked-state below resets to match
			previous_checked = [];
			update_party_statement_action();
		},
		formatter: function (value, row, column, data, default_formatter) {
			if (column.fieldname === "open_dashboard") {
				if (!data || !data.party_type || !data.party) return "";
				const party_type = frappe.utils.escape_html(data.party_type);
				const party = frappe.utils.escape_html(data.party);
				return render_dashboard_button(party_type, party);
			}
			return default_formatter(value, row, column, data);
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
	// last-seen result of getCheckedRows(), used by enforce_single_checked_row()
	// below to tell which row was just (un)checked -- getCheckedRows() always
	// comes back in ascending row-index order, not click order, so a plain diff
	// against the previous snapshot is the only reliable way to find it
	let previous_checked = [];
	let enforcing_single_check = false;

	function add_party_statement_action(report) {
		current_report = report;
		action_button = report.page.add_inner_button(__("Open Party Statement"), function () {
			open_party_statement();
		});
		update_party_statement_action();
	}

	function get_checked_rows() {
		if (!current_report || !current_report.datatable) {
			return [];
		}
		// frappe's QueryReport exposes get_checked_items() as a thin wrapper around
		// datatable.rowmanager.getCheckedRows() -- note "rowmanager", not ".rows",
		// which doesn't exist and is what silently broke this. fall back to the raw
		// datatable call in case get_checked_items is ever missing, and map its row
		// indexes back to report.data, which is where party_type/party for each
		// row actually live
		if (typeof current_report.get_checked_items === "function") {
			return current_report.get_checked_items();
		}
		if (!current_report.datatable.rowmanager) return [];
		const indexes = current_report.datatable.rowmanager.getCheckedRows() || [];
		return indexes.map((i) => current_report.data[i]).filter(Boolean);
	}

	function enforce_single_checked_row() {
		// keeps the checkbox column acting like a radio button: whichever row was
		// just checked wins, every other checked row gets unchecked to match
		if (enforcing_single_check) return;
		const rowmanager = current_report && current_report.datatable && current_report.datatable.rowmanager;
		if (!rowmanager) return;

		const checked = rowmanager.getCheckedRows() || [];
		if (checked.length > 1) {
			// the row missing from the previous snapshot is the one just clicked;
			// if that's ambiguous (e.g. the header "check all" box), fall back to
			// the highest row index so the collapse is at least deterministic
			const newly_checked = checked.find((i) => !previous_checked.includes(i));
			const keep = newly_checked !== undefined ? newly_checked : checked[checked.length - 1];

			enforcing_single_check = true;
			try {
				checked.forEach((rowIndex) => {
					if (rowIndex !== keep) {
						rowmanager.checkRow(rowIndex, false);
					}
				});
			} finally {
				enforcing_single_check = false;
			}
		}

		previous_checked = rowmanager.getCheckedRows() || [];
	}

	function update_party_statement_action() {
		if (!action_button) return;
		const checked = get_checked_rows();
		action_button.prop("disabled", checked.length !== 1);
	}

	function route_to_party_statement(party_type, party) {
		// route_options is applied against Party Statement's own filters in
		// declaration order (party_type, then party), so by the time its
		// party_type on_change clears party (see above) and defers its refresh,
		// party has already been re-set to our value -- same deferred-refresh
		// trick this report's own on_change relies on
		frappe.route_options = {
			party_type: party_type,
			party: party,
		};
		frappe.set_route("query-report", "Party Statement");
	}

	// the dashboard opens in this same tab: it is the overview you drill down
	// from, so the desk router handles it and the browser Back button returns
	// to this report. route_options survives an in-app route change, and
	// party_dashboard reads it on its on_page_show.
	function open_party_dashboard(party_type, party) {
		frappe.route_options = { party_type: party_type, party: party };
		frappe.set_route("party-dashboard");
	}

	function open_party_statement() {
		const checked = get_checked_rows();
		if (checked.length !== 1) return;

		const row = checked[0];
		route_to_party_statement(row.party_type, row.party);
	}

	// one per-row button in the one HTML cell: "Dashboard" hands off to the
	// Party Dashboard page, carrying the row's own party_type/party on data-
	// attributes for the delegated click handler in add_dashboard_button() to
	// route with.
	function render_dashboard_button(party_type, party) {
		return (
			'<button type="button" class="btn btn-xs btn-default open-dashboard-btn" ' +
			'data-party-type="' + party_type + '" data-party="' + party + '">' +
			__("Dashboard") +
			"</button>"
		);
	}

	function add_dashboard_button(report) {
		// the per-row buttons rendered by the "formatter" hook above are plain
		// <button>s, re-rendered on every refresh/filter change -- delegating the
		// click handlers from the page wrapper (bound once, here) means they keep
		// working across re-renders without needing to rebind them each time
		report.page.wrapper.on("click", ".open-dashboard-btn", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const $btn = $(this);
			const party_type = $btn.attr("data-party-type");
			const party = $btn.attr("data-party");
			if (!party_type || !party) return;
			open_party_dashboard(party_type, party);
		});
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
