// The BRS Dashboard's Transaction tab: BRS Transactions as a report, a table of
// them narrowed by Bank Account, Date and a Search (BRS-Transaction-Report.MD).
//
// Not a page of its own. hooks.py's page_js appends this file to brs_dashboard.js
// when the page is loaded, and the dashboard builds the tab out of the class this
// registers under TAB_KEY, into the pane under the tab's button.
(function () {
	// the tab's key in the dashboard's TABS, and the one this registers under
	const TAB_KEY = "transaction";
	const STYLE_ID = "logicx-brs-transaction-report-styles";
	const TRANSACTION_DOCTYPE = "BRS Transaction";

	const SERVER = "logicx_biz.logicx_hr.page.brs_dashboard.brs_transaction_report.brs_transaction_report";
	const GET_TRANSACTIONS_METHOD = `${SERVER}.get_transactions`;
	// the company's own bank accounts, the disabled ones included (see the .py)
	const BANK_ACCOUNT_QUERY = `${SERVER}.bank_account_query`;

	// a change to any filter asks the same question again, so a few in quick
	// succession -- a date typed out, a search word by word -- need one request
	const FILTER_DEBOUNCE_MS = 300;

	// the filters, in the order they read. Labels are laid out off-screen (see the
	// styles), so each field names itself in its placeholder, as the Party
	// Dashboard's filters do.
	const FILTERS = [
		{
			fieldname: "bank_account",
			label: __("Bank Account"),
			fieldtype: "Link",
			options: "Bank Account",
			placeholder: __("Bank Account"),
			get_query: () => ({ query: BANK_ACCOUNT_QUERY }),
		},
		{
			fieldname: "date",
			label: __("Date"),
			fieldtype: "Date",
			placeholder: __("Date"),
		},
		{
			fieldname: "search",
			label: __("Search"),
			fieldtype: "Data",
			placeholder: __("Reference Number | Description"),
		},
	];

	// the columns, in the order they read. Width is a share of the table rather than
	// a pixel count -- the layout is fluid -- so Description takes what the narrower
	// columns in front of it leave.
	function get_columns() {
		return [
			{ fieldname: "bank_account", label: __("Account"), width: 200, format: format_text },
			{ fieldname: "date", label: __("Date"), width: 90, format: format_date },
			{ fieldname: "deposit", label: __("Deposit"), width: 120, align: "right", format: format_amount },
			{ fieldname: "withdrawal", label: __("Withdraw"), width: 120, align: "right", format: format_amount },
			{ fieldname: "reference_number", label: __("Reference Number"), width: 150, format: format_text },
			{ fieldname: "description", label: __("Description"), width: 350, format: format_text },
		];
	}

	class BRSTransactionReport {
		// built by the dashboard the first time the tab is shown, into the tab's own
		// pane. Nothing is fetched here: on_show() is called straight after, and
		// fetches.
		constructor({ $wrapper }) {
			inject_styles();

			this.$el = $('<div class="logicx-bt"></div>').appendTo($wrapper).html(render_scaffold());
			this.table = null;
			// the rows the table was built from, which a click on one is looked up in
			this.rows = [];
			// bumped per fetch, so that an answer the next change of filters has
			// already superseded is dropped rather than drawn over the newer one
			this.seq = 0;
			// frappe lazy-loads the datatable bundle; started now, so that it is on
			// its way while the first rows are fetched
			this.datatable_ready = ensure_datatable();

			this.setup_filters();
			// on the table's body only: the header, with the table's own filter row
			// in it, is outside .dt-scrollable
			this.$el.on("click", ".dt-scrollable", (event) => this.open_row(event));

			function inject_styles() {
				let style = document.getElementById(STYLE_ID);
				if (!style) {
					style = document.createElement("style");
					style.id = STYLE_ID;
					document.head.appendChild(style);
				}
				style.textContent = TAB_STYLES;
			}

			function render_scaffold() {
				return `
					<div class="logicx-bt-filters"></div>
					<div class="logicx-bt-card">
						<div class="logicx-bt-body"></div>
						<div class="logicx-bt-footer"></div>
					</div>
				`;
			}
		}

		// every time the tab comes on screen the rows are fetched again: an import
		// on the tab beside this one is what puts new ones here
		on_show() {
			this.refresh();
		}

		/* ------------------------------------------------------------- filters */

		setup_filters() {
			const $bar = this.$el.find(".logicx-bt-filters");
			const refresh = frappe.utils.debounce(() => this.refresh(), FILTER_DEBOUNCE_MS);

			// the doc the controls keep their values in, as a dialog's controls do.
			// A control tells a change from none by comparing against its doc; with
			// none it compares against nothing, and an emptied Date parses to nothing
			// too -- so clearing the Date would never count as a change, and the
			// table would go on showing that day's rows.
			this.values = {};

			FILTERS.forEach((df) =>
				frappe.ui.form.make_control({
					parent: $(`<div class="logicx-bt-filter" data-filter="${df.fieldname}"></div>`).appendTo($bar),
					df: Object.assign({}, df, { change: refresh }),
					doc: this.values,
					render_input: true,
				})
			);
		}

		// what the filters currently say: the values the controls last set, after
		// their own validation, rather than whatever is typed in the inputs. A blank
		// one is left out rather than sent as an empty string, so a filter only ever
		// narrows the report.
		filter_values() {
			return FILTERS.reduce((values, df) => {
				const value = cstr(this.values[df.fieldname]).trim();
				if (value) values[df.fieldname] = value;
				return values;
			}, {});
		}

		/* ------------------------------------------------------------- loading */

		// the table on screen stays there while its replacement is fetched, rather
		// than blinking out on every word typed into the search
		async refresh() {
			const seq = ++this.seq;
			if (this.table) this.$footer().html(note_html(__("Loading...")));
			else this.show_note(__("Loading..."));

			let result;
			try {
				// a few filters, so frappe.call's url-encoded form data is no
				// concern here, as it is for the Import tab's statements
				result = await frappe.xcall(GET_TRANSACTIONS_METHOD, this.filter_values());
				await this.datatable_ready;
			} catch (error) {
				// frappe has shown the server's own message by now
				if (seq === this.seq) this.show_note(__("Could not load the transactions."), true);
				return;
			}

			// superseded by a newer fetch, or the user is on another tab by now: a
			// datatable built in a hidden pane sizes its columns wrong, and coming
			// back to this one fetches again anyway
			if (seq !== this.seq || !this.$el.is(":visible")) return;

			const rows = (result && result.rows) || [];
			if (!rows.length) {
				this.show_note(__("No BRS Transactions match these filters."));
				return;
			}
			this.build_table(rows);
			this.render_footer(rows.length, result.more);
		}

		/* --------------------------------------------------------------- table */

		build_table(rows) {
			const DataTableClass = frappe.DataTable || window.DataTable;
			if (!DataTableClass) {
				this.show_note(__("Could not load the transactions."), true);
				return;
			}

			this.destroy_table();
			const $body = this.$body().empty();

			this.rows = rows;
			this.table = new DataTableClass($body.get(0), {
				columns: get_columns().map(to_datatable_column),
				data: rows,
				layout: "fluid",
				inlineFilters: true,
				serialNoColumn: false,
				checkboxColumn: false,
				disableReorderColumn: true,
				dynamicRowHeight: true,
				noDataMessage: __("No BRS Transactions match these filters."),
			});
		}

		// how many rows the table holds, and when the server held some back, that
		// these are the latest of them
		render_footer(shown, more) {
			this.$footer().html(
				note_html(
					more
						? __("Showing the latest {0} transactions. Narrow the filters to see older ones.", [shown])
						: shown === 1
						? __("1 transaction")
						: __("{0} transactions", [shown])
				)
			);
		}

		// a click on a row opens its BRS Transaction -- in a new browser tab with
		// Ctrl or Cmd held, as a link would. A click that ends a text selection is
		// the user copying a reference number, not asking for the form.
		open_row(event) {
			const selection = window.getSelection && window.getSelection();
			if (selection && selection.toString().trim()) return;

			// the datatable numbers a row by its place in the data it was handed,
			// and keeps that number through its sorting and its own filter row
			const $row = $(event.target).closest("[data-row-index]");
			const row = $row.length ? this.rows[cint($row.attr("data-row-index"))] : null;
			if (!row || !row.name) return;

			if (event.ctrlKey || event.metaKey) {
				window.open(frappe.utils.get_form_link(TRANSACTION_DOCTYPE, row.name), "_blank");
			} else {
				frappe.set_route("Form", TRANSACTION_DOCTYPE, row.name);
			}
		}

		destroy_table() {
			if (this.table && typeof this.table.destroy === "function") this.table.destroy();
			this.table = null;
			this.rows = [];
		}

		show_note(text, is_error) {
			this.destroy_table();
			this.$footer().empty();
			this.$body().html(note_html(text, is_error));
		}

		$body() {
			return this.$el.find(".logicx-bt-body");
		}

		$footer() {
			return this.$el.find(".logicx-bt-footer");
		}
	}

	// handed to the dashboard, which reads it once the page's whole script has run
	frappe.provide("logicx_biz.brs_dashboard.tabs");
	logicx_biz.brs_dashboard.tabs[TAB_KEY] = BRSTransactionReport;

	/* --------------------------------------------------------------------- cells */

	function to_datatable_column(col) {
		return {
			id: col.fieldname,
			name: col.label,
			width: col.width,
			align: col.align || "left",
			editable: false,
			focusable: false,
			dropdown: true, // sortable
			sortable: true, // sortable
			format: (value) => col.format(value),
		};
	}

	// the cell keeps the YYYY-MM-DD the server sent, which is what sorting the
	// column reads; only what is shown is in the user's own date format
	function format_date(value) {
		return value ? frappe.datetime.str_to_user(value) : "";
	}

	function format_amount(value) {
		// a transaction carries a Deposit or a Withdrawal, never both (see
		// brs_transaction.py validate_amounts), so the other side of the row reads
		// blank rather than as a zero
		if (!flt(value)) return "";
		return frappe.format(value, { fieldtype: "Currency" }, { always_show_decimals: true });
	}

	function format_text(value) {
		return value ? frappe.utils.escape_html(value) : "";
	}

	function note_html(text, is_error) {
		return `<div class="logicx-bt-note${is_error ? " is-error" : ""}">${frappe.utils.escape_html(text)}</div>`;
	}

	/* ------------------------------------------------------------------- loading */

	function ensure_datatable() {
		if (frappe.DataTable || window.DataTable) return Promise.resolve();
		// frappe.require has taken a callback in some versions and returned a
		// promise in others, so settle on whichever one this build offers -- this
		// promise must always resolve, or the tab hangs on "Loading..."
		return new Promise(function (resolve) {
			try {
				const loading = frappe.require("data_table.bundle.js", resolve);
				if (loading && typeof loading.then === "function") loading.then(resolve, resolve);
			} catch (error) {
				resolve();
			}
		});
	}

	/* -------------------------------------------------------------------- styles */

	// the tab's own, under its own prefix; the page around it -- the tab strip,
	// and the margin the panes sit in -- is the dashboard's
	const TAB_STYLES = `
		.logicx-bt {
			display: flex;
			flex-direction: column;
			gap: var(--margin-md);
		}

		.logicx-bt-filters {
			display: flex;
			flex-wrap: wrap;
			gap: var(--margin-sm) var(--margin-md);
		}

		.logicx-bt-filter {
			flex: 1 1 200px;
			min-width: 160px;
			max-width: 280px;
		}

		/* the search takes free text, so it reads longer than the fields beside it */
		.logicx-bt-filter[data-filter="search"] {
			flex: 2 1 260px;
			max-width: 420px;
		}

		/* frappe's control markup ships its own bottom margin; the flex gap above
		   already spaces these, so drop it */
		.logicx-bt-filter .frappe-control {
			margin-bottom: 0;
		}

		/* the filters are named by their placeholders, so their labels are dropped
		   from the layout. They stay in the markup, off-screen, so each input keeps
		   an accessible name. */
		.logicx-bt-filter .control-label {
			position: absolute;
			width: 1px;
			height: 1px;
			margin: -1px;
			padding: 0;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
			border: 0;
		}

		.logicx-bt-card {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			overflow: hidden;
		}

		/* frappe-datatable draws its own borders; the card above supplies the
		   outer one, and the rounded corners need to clip the rows inside it */
		.logicx-bt-card .datatable {
			border: none;
		}

		/* a bank's narration runs long, so a Description wraps onto as many lines
		   as it takes -- dynamicRowHeight grows the row to match -- rather than
		   being cut off with an ellipsis. Scoped to the scrollable body: the
		   header labels keep their one line. */
		.logicx-bt-card .dt-scrollable .dt-cell__content {
			white-space: normal;
			overflow-wrap: break-word;
			text-overflow: clip;
		}

		/* a row opens its BRS Transaction (open_row), so it reads as something
		   to click */
		.logicx-bt-card .dt-scrollable .dt-row {
			cursor: pointer;
		}

		.logicx-bt-card .dt-scrollable .dt-row:hover .dt-cell {
			background-color: var(--highlight-color);
		}

		.logicx-bt-note {
			padding: var(--padding-md);
			color: var(--text-muted);
			text-align: center;
		}

		.logicx-bt-note.is-error {
			color: var(--red-500);
		}

		.logicx-bt-footer:empty {
			display: none;
		}

		.logicx-bt-footer .logicx-bt-note {
			border-top: 1px solid var(--border-color);
			padding: var(--padding-sm);
			font-size: var(--text-sm);
		}
	`;
})();
