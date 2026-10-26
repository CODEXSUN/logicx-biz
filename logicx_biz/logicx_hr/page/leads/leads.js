(function () {
	const PAGE_NAME = "leads";
	const STYLE_ID = "logicx-leads-styles";
	const LIST_METHOD = "logicx_biz.logicx_hr.leads.get_leads";

	// where a click on a row goes: the Mobile Dashboard, opened on the
	// Enquiry's Mobile, which that page reads off route_options or the URL's
	// ?mobile= (see its apply_prefill)
	const MOBILE_DASHBOARD = "mobile-dashboard";

	// how long the typed boxes wait after the last key before the list is read
	// again
	const FILTER_DEBOUNCE_MS = 300;

	// exactly 10 digits, with no +91, spaces or dashes: the rule a Mobile
	// Contact is saved by (see logicx_erp/mobile_validation.py), and so the only
	// Mobile an Enquiry can have
	const MOBILE_PATTERN = /^\d{10}$/;

	// the boxes above the list, left to right, and the Show Closed box on the
	// bar below them. `key` is what get_leads is asked by, and what the URL
	// keeps it under (see write_url_params); a box with a `pattern` narrows
	// nothing until what it holds matches it (see accepted). Q# is the Enquiry
	// itself, Title keeps the Enquiries whose Title holds what was typed
	// anywhere in it, Status Group the ones whose Status is in the group, and
	// the others the ones whose field is the one picked (see leads.py).
	const FILTERS = [
		{ key: "enquiry", label: __("Q#"), fieldtype: "Data" },
		{ key: "date", label: __("Date"), fieldtype: "Date" },
		{ key: "title", label: __("Title"), fieldtype: "Data" },
		{
			key: "mobile",
			label: __("Mobile"),
			fieldtype: "Data",
			inputmode: "numeric",
			pattern: MOBILE_PATTERN,
		},
		{ key: "customer", label: __("Customer"), fieldtype: "Link", options: "Customer" },
		{ key: "list_in", label: __("List in"), fieldtype: "Link", options: "Enquiry Group" },
		{ key: "lead_by", label: __("Lead By"), fieldtype: "Link", options: "Employee" },
		{ key: "assigned_to", label: __("Assigned To"), fieldtype: "Link", options: "Employee" },
		// its options are Enquiry Status's own Status Group ones -- New, Pending,
		// Hold and Closed as shipped -- filled in once they are read (see
		// load_status_groups)
		{ key: "status_group", label: __("Status Group"), fieldtype: "Select" },
		{ key: "status", label: __("Status"), fieldtype: "Link", options: "Enquiry Status" },
		// unticked as the page opens: until it is ticked the list leaves out the
		// Enquiries whose Status is in the Closed group -- Won, Lost, Closed and
		// Duplicate as seeded -- unless a Status or Status Group is picked
		{ key: "show_closed", label: __("Show Closed"), fieldtype: "Check" },
	];

	// what the list shows. `type` decides how a value is formatted, `align`
	// where it sits in its cell (left unless given), and `width` is what a
	// column is given, the one marked `stretch` taking whatever room the card
	// has left over on top (see fit_columns). every row carries its Enquiry's
	// Mobile too, though no column shows it: it is where a click on the row goes
	// (see open_row).
	const COLUMNS = [
		{ id: "name", name: __("Q#"), width: 100 },
		{ id: "date", name: __("Date"), type: "Date", width: 125, align: "center" },
		{ id: "title", name: __("Title"), width: 180, stretch: true },
		{ id: "customer_name", name: __("Customer"), width: 200 },
		{ id: "group", name: __("List in"), width: 125 },
		// the Employee who created the Enquiry (see Enquiry.before_validate)
		{ id: "created_by_name", name: __("Lead By"), width: 200 },
		{ id: "assigned_to_name", name: __("Assigned To"), width: 200 },
		{ id: "status", name: __("Status"), width: 125 },
	];

	// held across on_page_load / on_page_show, which frappe calls separately
	let leads = null;

	frappe.pages[PAGE_NAME].on_page_load = function (wrapper) {
		leads = new LeadsPage(wrapper);
	};

	frappe.pages[PAGE_NAME].on_page_show = function () {
		if (leads) leads.on_show();
	};

	class LeadsPage {
		constructor(wrapper) {
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: __("Leads"),
				single_column: true,
			});

			inject_styles();

			this.$el = $('<div class="logicx-lds"></div>').appendTo(this.page.main).html(render_scaffold());

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
			this.load_status_groups();
			this.setup_events();
		}

		/* ------------------------------------------------------------- filters */

		// a Data box is read as the user types -- once they stop for
		// FILTER_DEBOUNCE_MS -- or at once on Enter. the others are read once
		// they settle on a value: a Link once it has checked what was picked, a
		// Date once it is picked or typed in full, the Show Closed box as it is
		// ticked.
		setup_filters() {
			const search = frappe.utils.debounce(() => this.search(), FILTER_DEBOUNCE_MS);
			this.controls = {};

			FILTERS.forEach((filter) => {
				const typed = filter.fieldtype === "Data";
				const control = frappe.ui.form.make_control({
					parent: this.$el.find(`[data-filter="${filter.key}"]`),
					df: {
						fieldname: filter.key,
						label: filter.label,
						// a box's label is off-screen, so the field names itself here
						placeholder: filter.label,
						fieldtype: filter.fieldtype,
						options: filter.options,
						change: typed ? null : () => this.search(),
					},
					render_input: true,
				});
				this.controls[filter.key] = control;
				if (!typed) return;

				const $input = control.$input;
				$input.attr({ inputmode: filter.inputmode || null, autocomplete: "off" });
				$input.on("input", search);
				$input.on("keydown", (e) => {
					if (e.key !== "Enter") return;
					e.preventDefault();
					this.search();
				});
			});

			// the Status box offers only the Statuses in the Status Group picked,
			// when one is
			this.controls.status.df.get_query = () => {
				const group = this.controls.status_group.value;
				return group ? { filters: { status_group: group } } : {};
			};
		}

		// the Status Group box's options, read off Enquiry Status's own Select, so
		// a group added there is offered here too. a group the URL asked for
		// before they came is kept meanwhile (see filter_values), and shown once
		// they do.
		load_status_groups() {
			frappe.model.with_doctype("Enquiry Status", () => {
				const field = frappe.meta.get_docfield("Enquiry Status", "status_group");
				const groups = String((field && field.options) || "")
					.split("\n")
					.filter(Boolean);
				const control = this.controls.status_group;
				control.df.options = ["", ...groups];
				control.set_input(control.value || "");
			});
		}

		// what the boxes say now, spaces and all trimmed off. a Data box is read
		// as it stands, mid-word and all, but for one its pattern turns away; any
		// other by the value it last settled on, so a Link still being typed in
		// is read as it was before. the Show Closed box is "1" ticked and "" not,
		// as the URL keeps it.
		filter_values() {
			const values = {};
			FILTERS.forEach((filter) => {
				const control = this.controls[filter.key];
				if (filter.fieldtype === "Check") values[filter.key] = control.value ? "1" : "";
				else if (filter.fieldtype === "Data")
					values[filter.key] = accepted(filter, String(control.$input.val() || "").trim());
				else values[filter.key] = String(control.value || "").trim();
			});
			return values;
		}

		// set_input rather than set_value: it fires no change, and a Link takes
		// the value without checking it first
		set_boxes(filters) {
			FILTERS.forEach((filter) => this.controls[filter.key].set_input(filters[filter.key]));
		}

		// the list read again for what the boxes say -- unless that is what it
		// was read for already, as when the debounce lands after Enter has, or
		// a Link fires its change again for the same pick. `force` reads it
		// regardless, for Refresh.
		search({ force = false } = {}) {
			const filters = this.filter_values();
			if (!force && same_filters(filters, this.filters)) return;
			this.load(filters);
		}

		// the list as the page opened -- every box empty, Show Closed unticked --
		// the first box ready for the next search
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
				// back on the page -- from the Mobile Dashboard a row opened, say,
				// where an Enquiry may have been closed or handed on since. the URL
				// is brought up to date, since arriving from the sidebar clears it,
				// and a list that landed while the page was hidden is built now.
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
				const value = String(source[filter.key] || "").trim();
				asked[filter.key] =
					filter.fieldtype === "Check" ? (cint(value) ? "1" : "") : accepted(filter, value);
			});
			return asked;
		}

		// what the list was read for is kept in the URL, a parameter per box
		// filled in (see FILTERS) and ?show_closed=1 while that is ticked, so a
		// browser refresh, or a link copied from the address bar, opens on it
		// again. the URL is replaced rather than pushed: a search is not a
		// navigation, and Back should leave the page rather than step through
		// every search tried. any other query parameter is left as it was.
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

		// the Enquiries read for `filters`. `quiet` keeps what is on screen
		// until the answer replaces it, and leaves it alone if none comes.
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
				.call({
					method: LIST_METHOD,
					// get_leads takes Show Closed as a bool, which "" is not
					args: Object.assign({}, filters, { show_closed: filters.show_closed ? 1 : 0 }),
				})
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
			// a row is an Enquiry, and a click opens the Mobile Dashboard on its
			// Mobile -- in a new browser tab with Ctrl / Cmd held, as a link would.
			// only body rows carry a row index: the header and the inline filter
			// row above them are the table's own.
			this.$el.on("click", ".logicx-lds-card-body .dt-row[data-row-index]", (e) => {
				this.open_row(Number($(e.currentTarget).attr("data-row-index")), e.ctrlKey || e.metaKey);
			});

			this.$el.on("click", ".logicx-lds-clear", () => this.clear_filters());
			this.$el.on("click", ".logicx-lds-refresh", () => this.search({ force: true }));
		}

		// the row's index is datatable's own, which stays with the row however
		// the table is sorted or filtered, so it reads straight off the rows the
		// table was built from. an Enquiry with no Mobile -- one from before
		// Mobile was mandatory -- has no Mobile Dashboard to open, and opens
		// itself instead.
		open_row(index, in_new_tab) {
			const row = this.result && this.result.rendered ? this.result.rows[index] : null;
			if (!row) return;

			if (!row.mobile) {
				if (in_new_tab) window.open(frappe.utils.get_form_link("Enquiry", row.name), "_blank");
				else frappe.set_route("Form", "Enquiry", row.name);
				return;
			}
			if (in_new_tab) {
				window.open(mobile_dashboard_url(row.mobile), "_blank");
				return;
			}
			frappe.set_route(MOBILE_DASHBOARD, { mobile: row.mobile });
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

		// "42 Leads" at the right end of the bar, blank while nothing is listed
		set_count(text) {
			const label = !text ? "" : text === "1" ? __("1 Lead") : __("{0} Leads", [text]);
			this.$el.find(".logicx-lds-count").text(label);
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
				this.show_note(empty_note(this.filters));
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
			return this.$el.find(".logicx-lds-card-body");
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

	// what the list is read by for a box holding `value`: a value its `pattern`
	// turns away -- a Mobile short of 10 digits, say -- is not one yet, and
	// narrows nothing
	function accepted(filter, value) {
		return filter.pattern && !filter.pattern.test(value) ? "" : value;
	}

	function same_filters(a, b) {
		return FILTERS.every((filter) => a[filter.key] === b[filter.key]);
	}

	// whether any box narrows the list. the Show Closed box widens it instead,
	// so it is not counted.
	function has_filters(filters) {
		return FILTERS.some((filter) => filter.fieldtype !== "Check" && filters[filter.key]);
	}

	// what an empty list says: nothing matched the boxes, or with none filled in,
	// there is nothing open -- or nothing at all, once Show Closed is ticked
	function empty_note(filters) {
		if (has_filters(filters)) return __("No Enquiry matches these filters.");
		return filters.show_closed ? __("No Enquiries.") : __("No open Enquiries.");
	}

	/* ==================================================================== markup */

	// the boxes in rows across the top, then the bar: Show Closed, Clear
	// Filters and Refresh at its left, and the count at its right end
	function render_scaffold() {
		const boxes = FILTERS.filter((filter) => filter.fieldtype !== "Check")
			.map((filter) => `<div class="logicx-lds-search" data-filter="${filter.key}"></div>`)
			.join("");
		const checks = FILTERS.filter((filter) => filter.fieldtype === "Check")
			.map((filter) => `<div class="logicx-lds-check" data-filter="${filter.key}"></div>`)
			.join("");

		return `
			<div class="logicx-lds-filters">${boxes}</div>
			<div class="logicx-lds-bar">
				${checks}
				<div class="logicx-lds-actions">
					<button type="button" class="btn btn-default btn-sm logicx-lds-clear">
						${__("Clear Filters")}
					</button>
					<button type="button" class="btn btn-default btn-sm logicx-lds-refresh">
						${__("Refresh")}
					</button>
				</div>
				<div class="logicx-lds-count"></div>
			</div>
			<div class="logicx-lds-card-body"></div>
		`;
	}

	function note_html(text, is_error) {
		const css_class = is_error ? "logicx-lds-note is-error" : "logicx-lds-note";
		return `<div class="${css_class}">${frappe.utils.escape_html(text)}</div>`;
	}

	// the Mobile Dashboard on `mobile`, as the address a Ctrl / Cmd click opens
	// in a new browser tab. route_options cannot ride along into a fresh
	// document, so the number goes as ?mobile=, which that page reads too.
	function mobile_dashboard_url(mobile) {
		return `${frappe.router.make_url([MOBILE_DASHBOARD])}?${new URLSearchParams({ mobile })}`;
	}

	/* ==================================================================== tables */

	function to_datatable_column(col) {
		return {
			id: col.id,
			name: col.name,
			width: col.width || 120,
			// set on every column, left unless it says otherwise: left unset,
			// frappe-datatable right-aligns a column whose first row holds a
			// number -- and a blank counts as one, so an Enquiry with no List in,
			// or a Lead not yet assigned, on top turned that whole column right
			align: col.align || "left",
			editable: false,
			focusable: false,
			dropdown: true, // sortable
			sortable: true, // sortable
			format: (value) => format_cell(value, col),
		};
	}

	// frappe-datatable's "fluid" layout keeps none of the widths it is handed: it
	// measures each column by its header text and shares whatever room is left
	// out equally, so every column comes out much the same. the table is built
	// "fixed" instead, which keeps them, and the room the card has beyond them
	// all goes to the column marked `stretch` (Title), so the row ends flush
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
	// into the Enquiries they come from
	function format_cell(value, col) {
		if (value === null || value === undefined || value === "") return "";
		if (col.type === "Date") return frappe.utils.escape_html(frappe.datetime.str_to_user(value));
		return text_cell(value);
	}

	// a cell holds one line, cut short with an ellipsis, so the whole of it is
	// kept in the tooltip -- a Title in particular runs long
	function text_cell(value) {
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
		.logicx-lds {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
			padding: var(--padding-sm) var(--padding-md) var(--padding-lg);
		}

		/* the boxes, as many to a row as fit at a width each still reads at, so
		   they line up in columns however the rows wrap */
		.logicx-lds-filters {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
			gap: var(--margin-sm);
			padding-top: var(--padding-md);
		}

		/* frappe's control markup ships its own bottom margin and an empty help
		   line under the box; neither has anything to space here */
		.logicx-lds-search .frappe-control,
		.logicx-lds-search .form-group {
			margin-bottom: 0;
		}

		.logicx-lds-search .help-box {
			display: none;
		}

		/* each box reads plainly from its placeholder, so its label is dropped
		   from the layout. it stays in the markup, off-screen, so the input
		   keeps an accessible name. */
		.logicx-lds-search .control-label {
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

		/* Show Closed, Clear Filters and Refresh at the left, the count pushed
		   to the right end. on a narrow screen the bar wraps. */
		.logicx-lds-bar {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--margin-sm) var(--margin-md);
			padding: var(--padding-xs) 0;
		}

		/* the Show Closed box keeps its label beside it. frappe's control markup
		   ships its own margins and an empty help line, which have nothing to
		   space here. */
		.logicx-lds-check {
			flex: 0 0 auto;
		}

		.logicx-lds-check .frappe-control,
		.logicx-lds-check .form-group,
		.logicx-lds-check .checkbox {
			margin: 0;
		}

		.logicx-lds-check .help-box {
			display: none;
		}

		.logicx-lds-actions {
			flex: 0 0 auto;
			display: flex;
			gap: var(--margin-sm);
		}

		.logicx-lds-count {
			flex: 0 0 auto;
			margin-left: auto;
			font-size: var(--text-md);
			color: var(--text-muted);
			font-variant-numeric: tabular-nums;
			white-space: nowrap;
		}

		/* the datatable brings its own padding, so its body has none, and is
		   clipped to the outline it is read inside */
		.logicx-lds-card-body {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			overflow: hidden;
		}

		.logicx-lds-card-body .datatable {
			border: none;
		}

		/* every body row opens the Mobile Dashboard on its number (see open_row) */
		.logicx-lds-card-body .dt-row[data-row-index] {
			cursor: pointer;
		}

		.logicx-lds-card-body .dt-row[data-row-index]:hover .dt-cell {
			background-color: var(--fg-hover-color, var(--gray-100));
		}

		/* the list's scroll box, sized as on the Mobile Dashboard */
		.logicx-lds-card-body .dt-scrollable {
			max-height: 33333px !important;
			overflow-y: auto !important;
		}

		.logicx-lds-note {
			padding: var(--padding-lg);
			font-size: var(--text-md);
			color: var(--text-muted);
			text-align: center;
		}

		.logicx-lds-note.is-error {
			color: var(--red-500);
		}
	`;
})();
