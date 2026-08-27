(function () {
	frappe.query_reports["Party Not Reconciled"] = {
		onload: function (report) {
			wrap_column_headers(report);
			bind_reconcile_link(report);
		},
		formatter: function (value, row, column, data, default_formatter) {
			if (column.fieldname === "reconcile" && data && data.party) {
				// plain content only -- reconcile_link_html below turns this into
				// the actual clickable <a>, kept out of the datatable's own
				// escaping/formatting path so the href data-attributes survive
				return reconcile_link_html(data);
			}
			return default_formatter(value, row, column, data);
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
	};


	const ROUTE = "Party Not Reconciled";
	const HEADER_WRAP_CLASS = "logicx-wrap-headers";
	const HEADER_HEIGHT_INCREASE = "15px";
	const FILTER_ROWS_INCREASE = `${0 * 40}px`;

	function reconcile_link_html(data) {
		// party/company are Frappe names (docname charset), never raw user text,
		// but escape them anyway since they land in an HTML attribute
		const party_type = frappe.utils.escape_html(data.party_type || "");
		const party = frappe.utils.escape_html(data.party || "");
		const company = frappe.utils.escape_html(data.company || "");
		return (
			`<a href="#" class="pnr-reconcile-link" ` +
			`data-party-type="${party_type}" data-party="${party}" data-company="${company}">` +
			`${__("Reconcile")}</a>`
		);
	}

	function bind_reconcile_link(report) {
		// delegated so it survives the datatable re-rendering rows on every
		// refresh/sort/filter -- bind once against the page wrapper, which
		// persists for the life of the report
		report.page.wrapper.off("click", ".pnr-reconcile-link").on("click", ".pnr-reconcile-link", function (e) {
			e.preventDefault();
			const $link = $(this);

			// prefilling and routing to a new document is the well-supported part
			// of this flow (frappe.new_doc applies frappe.route_options as the new
			// doc's field values); it does not run the form's "Get Unreconciled
			// Entries" step for us, since that needs a receivable/payable account
			// this report has no reliable way to resolve up front -- so the user
			// still picks the account and clicks that button themselves.
			frappe.route_options = {
				party_type: $link.data("party-type"),
				party: $link.data("party"),
			};
			const company = $link.data("company");
			if (company) {
				frappe.route_options.company = company;
			}
			frappe.new_doc("Payment Reconciliation");
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
