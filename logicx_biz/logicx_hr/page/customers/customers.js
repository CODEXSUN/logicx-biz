(function () {
	const PAGE_NAME = "customers";
	const STYLE_ID = "logicx-customers-styles";
	const LIST_METHOD = "logicx_biz.logicx_hr.customers.get_customers";

	// where a click on a row goes: the Customer Dashboard, opened on the row's
	// Customer, which that page reads off route_options or the URL's
	// ?customer= (see its apply_prefill)
	const CUSTOMER_DASHBOARD = "customer-dashboard";

	// how long the boxes wait after the last key before the list is read again
	const FILTER_DEBOUNCE_MS = 300;

	// the boxes above the list, left to right. `key` is what get_customers is
	// asked by, and what the URL keeps it under (see write_url_params); each
	// keeps the Customers whose field holds what was typed anywhere in it.
	const FILTERS = [
		{ key: "mobile", label: __("Mobile No"), inputmode: "numeric" },
		{ key: "customer_name", label: __("Name") },
	];

	// what the list shows. `width` is what a column is given, the one marked
	// `stretch` taking whatever room the card has left over on top (see
	// fit_columns). Email and GSTIN come back blank to a user who may only
	// select Customers (see _readable_fields in customers.py).
	const COLUMNS = [
		{ id: "name", name: __("ID"), width: 140 },
		{ id: "customer_name", name: __("Name"), width: 240, stretch: true },
		{ id: "mobile_no", name: __("Mobile"), width: 120 },
		{ id: "email_id", name: __("Email"), width: 240 },
		{ id: "gstin", name: __("GSTIN"), width: 170 },
	];

	// held across on_page_load / on_page_show, which frappe calls separately
	let customers = null;

	frappe.pages[PAGE_NAME].on_page_load = function (wrapper) {
		customers = new CustomersPage(wrapper);
	};

	frappe.pages[PAGE_NAME].on_page_show = function () {
		if (customers) customers.on_show();
	};

	class CustomersPage {
		constructor(wrapper) {
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: __("Customers"),
				single_column: true,
			});

			inject_styles();

			this.$el = $('<div class="logicx-cus"></div>').appendTo(this.page.main).html(render_scaffold());

			this.table = null;
			// what the list on screen was read for, a value per FILTERS key (see
			// load)
			this.filters = empty_filters();
			// the rows the list was built from, kept so a click on a row is
			// looked up here (see open_row), and so the same rows read again
			// leave the table as it was, sorted and searched as it was left
			this.result = null;
			// bumped per read, so a slow answer is dropped instead of landing
			// over the one asked for since
			this.seq = 0;
			// the page's first show is its opening, which reads the list (see
			// on_show)
			this.shown = false;
			// the URL is left alone until the first show has read it (see
			// write_url_params)
			this.url_ready = false;
			// frappe lazy-loads the datatable bundle; the report views await this
			// same call before constructing one, so the page does too
			this.datatable_ready = ensure_datatable();

			this.setup_filters();
			this.setup_events();
		}

		/* ------------------------------------------------------------- filters */

		// plain Data boxes, read as the user types -- once they stop for
		// FILTER_DEBOUNCE_MS -- or at once on Enter
		setup_filters() {
			const search = frappe.utils.debounce(() => this.search(), FILTER_DEBOUNCE_MS);
			this.controls = {};

			FILTERS.forEach((filter) => {
				const control = frappe.ui.form.make_control({
					parent: this.$el.find(`[data-filter="${filter.key}"]`),
					df: {
						fieldname: filter.key,
						label: filter.label,
						// the label is off-screen, so the field names itself here
						placeholder: filter.label,
						fieldtype: "Data",
					},
					render_input: true,
				});

				const $input = control.$input;
				$input.attr({ inputmode: filter.inputmode || null, autocomplete: "off" });
				$input.on("input", search);
				$input.on("keydown", (e) => {
					if (e.key !== "Enter") return;
					e.preventDefault();
					this.search();
				});
				this.controls[filter.key] = control;
			});
		}

		// what the boxes say now, spaces and all trimmed off
		filter_values() {
			const values = {};
			FILTERS.forEach((filter) => {
				values[filter.key] = String(this.controls[filter.key].$input.val() || "").trim();
			});
			return values;
		}

		set_boxes(filters) {
			FILTERS.forEach((filter) => this.controls[filter.key].set_input(filters[filter.key]));
		}

		// the list read again for what the boxes say -- unless that is what it
		// was read for already, as when the debounce lands after Enter has, or
		// a key added only a space. `force` reads it regardless, for Refresh.
		search({ force = false } = {}) {
			const filters = this.filter_values();
			if (!force && same_filters(filters, this.filters)) return;
			this.load(filters);
		}

		// every active Customer listed again, the first box ready for the next
		// search
		clear_filters() {
			this.set_boxes(empty_filters());
			this.search();
			this.controls[FILTERS[0].key].$input.trigger("focus");
		}

		on_show() {
			const asked = this.read_prefill();
			if (asked && !same_filters(asked, this.filters)) {
				this.set_boxes(asked);
				this.load(asked);
			} else if (!this.shown) {
				this.load(this.filters);
			} else {
				// back on the page -- from the Customer Dashboard a row opened,
				// say -- where a Customer may have been added or disabled since. the
				// URL is brought up to date, since arriving from the sidebar clears
				// it, and a list that landed while the page was hidden is built now.
				this.write_url_params();
				this.render();
				this.load(this.filters, { quiet: true });
			}
			this.shown = true;

			if (!has_filters(this.filters)) this.controls[FILTERS[0].key].$input.trigger("focus");
		}

		// what the URL asks the list to be read for, or null when it asks for
		// nothing. the router copies the URL's query string into route_options
		// on every route change, so this covers a refresh and the Back button as
		// well as another page routing here with a filter already set. the URL
		// is read directly too, for a desk that does not. a filter it leaves out
		// is asked for empty.
		read_prefill() {
			const from_route = frappe.route_options || {};
			frappe.route_options = null;
			const from_url = frappe.utils.get_query_params() || {};
			this.url_ready = true;

			const source = FILTERS.some((filter) => filter.key in from_route) ? from_route : from_url;
			if (!FILTERS.some((filter) => filter.key in source)) return null;

			const asked = {};
			FILTERS.forEach((filter) => {
				asked[filter.key] = String(source[filter.key] || "").trim();
			});
			return asked;
		}

		// what the list was read for is kept in the URL as ?mobile= and
		// ?customer_name=, so a browser refresh, or a link copied from the address
		// bar, opens on it again. the URL is replaced rather than pushed: a search
		// is not a navigation, and Back should leave the page rather than step
		// through every search tried. any other query parameter is left as it was.
		write_url_params() {
			// a read can be answered after the user has already moved on, and the
			// page they are on now has its own URL
			if (!this.url_ready || !this.on_screen()) return;

			const params = new URLSearchParams(window.location.search);
			FILTERS.forEach((filter) => {
				const value = this.filters[filter.key];
				if (value) params.set(filter.key, value);
				else params.delete(filter.key);
			});

			const query = params.toString();
			const search = query ? "?" + query : "";
			if (search === window.location.search) return;
			history.replaceState(history.state, "", window.location.pathname + search + window.location.hash);
		}

		on_screen() {
			return (frappe.get_route() || [])[0] === PAGE_NAME;
		}

		/* ------------------------------------------------------------- loading */

		// the active Customers read for `filters`. `quiet` keeps what is on
		// screen until the answer replaces it, and leaves it alone if none comes.
		load(filters, { quiet = false } = {}) {
			this.seq += 1;
			const seq = this.seq;
			this.filters = filters;
			this.write_url_params();
			if (!quiet) {
				this.set_count("");
				this.show_note(__("Loading..."));
			}

			frappe
				.call({ method: LIST_METHOD, args: filters })
				.then((r) => {
					if (seq !== this.seq) return;
					this.set_rows((r && r.message) || {});
				})
				.catch((error) => {
					if (seq !== this.seq) return;
					if (quiet) {
						console.error(error);
						return;
					}
					this.show_note(__("Could not load this list."), true);
				});
		}

		setup_events() {
			// a row is a Customer, and a click opens the Customer Dashboard on it
			// -- in a new browser tab with Ctrl / Cmd held, as a link would. only
			// body rows carry a row index: the header and the inline filter row
			// above them are the table's own.
			this.$el.on("click", ".logicx-cus-card-body .dt-row[data-row-index]", (e) => {
				this.open_row(Number($(e.currentTarget).attr("data-row-index")), e.ctrlKey || e.metaKey);
			});

			this.$el.on("click", ".logicx-cus-clear", () => this.clear_filters());
			this.$el.on("click", ".logicx-cus-refresh", () => this.search({ force: true }));
		}

		// the row's index is datatable's own, which stays with the row however
		// the table is sorted or filtered, so it reads straight off the rows the
		// table was built from
		open_row(index, in_new_tab) {
			const row = this.result && this.result.rendered ? this.result.rows[index] : null;
			if (!row) return;

			if (in_new_tab) {
				window.open(customer_dashboard_url(row.name), "_blank");
				return;
			}
			frappe.set_route(CUSTOMER_DASHBOARD, { customer: row.name });
		}

		/* --------------------------------------------------------------- table */

		// count the rows on the bar, remember them, and build the table from
		// them. the same rows as the table already shows leave it as it is --
		// which is how the quiet read on every show mostly comes back.
		set_rows({ rows = [], more = false }) {
			// "500+" when the server stopped short of the rest (see ROW_LIMIT in
			// mobile_dashboard.py)
			this.set_count(more ? `${rows.length}+` : String(rows.length));

			const json = JSON.stringify(rows);
			if (this.result && this.result.rendered && this.result.json === json) return;

			this.result = { rows, json };
			this.render();
		}

		// "42 Customers" at the right end of the bar, blank while nothing is
		// listed
		set_count(text) {
			const label = !text ? "" : text === "1" ? __("1 Customer") : __("{0} Customers", [text]);
			this.$el.find(".logicx-cus-count").text(label);
		}

		// the rows last read built into the table, once the page is on screen:
		// frappe-datatable sizes its columns wrong while it is hidden, as it is
		// when an answer lands after the user has moved on -- on_show builds it
		// then. `rendered` is what keeps it from building twice.
		render() {
			const result = this.result;
			if (!result || result.rendered || !this.on_screen()) return;
			result.rendered = true;

			if (!result.rows.length) {
				this.show_note(
					has_filters(this.filters)
						? __("No active Customer matches these filters.")
						: __("No active Customers.")
				);
				return;
			}

			this.datatable_ready.then(() => {
				// the list may have been read again while the bundle loaded
				if (this.result !== result) return;
				this.build_table(result);
			});
		}

		build_table(result) {
			const DataTableClass = frappe.DataTable || window.DataTable;
			if (!DataTableClass) {
				this.show_note(__("Could not load this list."), true);
				return;
			}

			const $body = this.$card_body();
			this.destroy_table();
			$body.empty();

			this.table = new DataTableClass($body.get(0), {
				columns: fit_columns(COLUMNS, $body.get(0).clientWidth).map(to_datatable_column),
				data: result.rows,
				// "fixed" keeps the widths it is handed, where "fluid" would throw
				// them away (see fit_columns)
				layout: "fixed",
				inlineFilters: true,
				serialNoColumn: false,
				checkboxColumn: false,
				disableReorderColumn: true,
				noDataMessage: __("No records"),
			});
		}

		destroy_table() {
			if (this.table && typeof this.table.destroy === "function") this.table.destroy();
			this.table = null;
		}

		$card_body() {
			return this.$el.find(".logicx-cus-card-body");
		}

		// the muted line shown in place of the table: while loading, when
		// empty, or in red when the request failed. the rows a click on the
		// table was looked up in go with it.
		show_note(text, is_error) {
			this.destroy_table();
			this.result = null;
			this.$card_body().html(note_html(text, is_error));
		}
	}

	/* ==================================================================== filters */

	function empty_filters() {
		const filters = {};
		FILTERS.forEach((filter) => {
			filters[filter.key] = "";
		});
		return filters;
	}

	function same_filters(a, b) {
		return FILTERS.every((filter) => a[filter.key] === b[filter.key]);
	}

	function has_filters(filters) {
		return FILTERS.some((filter) => filters[filter.key]);
	}

	/* ==================================================================== markup */

	// the boxes at the left of the bar, Clear Filters and Refresh just past
	// them, and the count at its right end
	function render_scaffold() {
		const boxes = FILTERS.map(
			(filter) => `<div class="logicx-cus-search" data-filter="${filter.key}"></div>`
		).join("");

		return `
			<div class="logicx-cus-bar">
				${boxes}
				<div class="logicx-cus-actions">
					<button type="button" class="btn btn-default btn-sm logicx-cus-clear">
						${__("Clear Filters")}
					</button>
					<button type="button" class="btn btn-default btn-sm logicx-cus-refresh">
						${__("Refresh")}
					</button>
				</div>
				<div class="logicx-cus-count"></div>
			</div>
			<div class="logicx-cus-card-body"></div>
		`;
	}

	function note_html(text, is_error) {
		const css_class = is_error ? "logicx-cus-note is-error" : "logicx-cus-note";
		return `<div class="${css_class}">${frappe.utils.escape_html(text)}</div>`;
	}

	// the Customer Dashboard on `customer`, as the address a Ctrl / Cmd click
	// opens in a new browser tab. route_options cannot ride along into a fresh
	// document, so the Customer goes as ?customer=, which that page reads too.
	function customer_dashboard_url(customer) {
		return `${frappe.router.make_url([CUSTOMER_DASHBOARD])}?${new URLSearchParams({ customer })}`;
	}

	/* ==================================================================== tables */

	function to_datatable_column(col) {
		return {
			id: col.id,
			name: col.name,
			width: col.width || 120,
			// set on every column: left unset, frappe-datatable right-aligns a
			// column whose first row holds a number, as Mobile always does
			align: col.align || "left",
			editable: false,
			focusable: false,
			dropdown: true, // sortable
			sortable: true, // sortable
			format: (value) => format_cell(value),
		};
	}

	// frappe-datatable's "fluid" layout keeps none of the widths it is handed: it
	// measures each column by its header text and shares whatever room is left
	// out equally, so every column comes out much the same. the table is built
	// "fixed" instead, which keeps them, and the room the card has beyond them
	// all goes to the column marked `stretch` (Name), so the row ends flush
	// with the card. none is ever shrunk: a list wider than the card scrolls
	// sideways rather than cramping every column to fit.
	function fit_columns(columns, available) {
		// each cell draws a 1px border beside the width its content is given,
		// and a couple of pixels are kept spare so rounding never tips the row
		// past the card into a scrollbar
		const room = available - columns.length - 2;
		const total = columns.reduce((sum, col) => sum + col.width, 0);
		if (!(room > total)) return columns;

		return columns.map((col) =>
			col.stretch ? Object.assign({}, col, { width: col.width + room - total }) : col
		);
	}

	// every value is escaped on its way in: the rows are whatever was typed
	// into the Customers they come from. a cell holds one line, cut short with
	// an ellipsis, so the whole of it is kept in the tooltip.
	function format_cell(value) {
		if (value === null || value === undefined || value === "") return "";
		const text = frappe.utils.escape_html(String(value));
		return `<span title="${text}">${text}</span>`;
	}

	function ensure_datatable() {
		if (frappe.DataTable || window.DataTable) return Promise.resolve();
		// frappe.require has taken a callback in some versions and returned a
		// promise in others, so settle on whichever one this build offers --
		// this promise must always resolve or the list hangs on "Loading..."
		return new Promise(function (resolve) {
			try {
				const loading = frappe.require("data_table.bundle.js", resolve);
				if (loading && typeof loading.then === "function") loading.then(resolve, resolve);
			} catch (e) {
				resolve();
			}
		});
	}

	/* ==================================================================== styles */

	// injected rather than kept in a sibling .css, for the reason the Party
	// Dashboard gives: a standard Page's .css asset is not reliably served
	// across frappe versions. textContent is re-set on every load so edits to
	// this file take effect without a hard browser reload.
	function inject_styles() {
		let style = document.getElementById(STYLE_ID);
		if (!style) {
			style = document.createElement("style");
			style.id = STYLE_ID;
			document.head.appendChild(style);
		}
		style.textContent = PAGE_STYLES;
	}

	const PAGE_STYLES = `
		.logicx-cus {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
			padding: var(--padding-sm) var(--padding-md) var(--padding-lg);
		}

		/* the boxes at the left, the count pushed to the right end. on a narrow
		   screen the bar wraps rather than squeezing the boxes past reading. */
		.logicx-cus-bar {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--margin-sm) var(--margin-md);
			padding: var(--padding-md) 0 var(--padding-xs);
		}

		/* a mobile number is short, a name runs longer */
		.logicx-cus-search {
			flex: 0 1 180px;
			min-width: 140px;
		}

		.logicx-cus-search[data-filter="customer_name"] {
			flex-basis: 280px;
			min-width: 180px;
		}

		/* frappe's control markup ships its own bottom margin and an empty help
		   line under the box; neither has anything to space here */
		.logicx-cus-search .frappe-control,
		.logicx-cus-search .form-group {
			margin-bottom: 0;
		}

		.logicx-cus-search .help-box {
			display: none;
		}

		/* each box reads plainly from its placeholder, so its label is dropped
		   from the layout. it stays in the markup, off-screen, so the input
		   keeps an accessible name. */
		.logicx-cus-search .control-label {
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

		/* Clear Filters and Refresh, just past the boxes */
		.logicx-cus-actions {
			flex: 0 0 auto;
			display: flex;
			gap: var(--margin-sm);
		}

		.logicx-cus-count {
			flex: 0 0 auto;
			margin-left: auto;
			font-size: var(--text-md);
			color: var(--text-muted);
			font-variant-numeric: tabular-nums;
			white-space: nowrap;
		}

		/* the datatable brings its own padding, so its body has none, and is
		   clipped to the outline it is read inside */
		.logicx-cus-card-body {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			overflow: hidden;
		}

		.logicx-cus-card-body .datatable {
			border: none;
		}

		/* every body row opens the Customer Dashboard on its Customer (see
		   open_row) */
		.logicx-cus-card-body .dt-row[data-row-index] {
			cursor: pointer;
		}

		.logicx-cus-card-body .dt-row[data-row-index]:hover .dt-cell {
			background-color: var(--fg-hover-color, var(--gray-100));
		}

		/* the list's scroll box, sized as on the Mobile Dashboard */
		.logicx-cus-card-body .dt-scrollable {
			max-height: 33333px !important;
			overflow-y: auto !important;
		}

		.logicx-cus-note {
			padding: var(--padding-lg);
			font-size: var(--text-md);
			color: var(--text-muted);
			text-align: center;
		}

		.logicx-cus-note.is-error {
			color: var(--red-500);
		}
	`;
})();
