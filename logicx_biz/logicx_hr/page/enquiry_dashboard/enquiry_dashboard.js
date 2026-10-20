(function () {
	const PAGE_NAME = "enquiry-dashboard";
	const STYLE_ID = "logicx-enquiry-dashboard-styles";
	const DASHBOARD_METHOD = "logicx_biz.logicx_hr.enquiry_dashboard.get_dashboard";

	// exactly 10 digits, with no +91, spaces or dashes: the rule a Mobile Contact
	// is saved by (see logicx_erp/mobile_validation.py), so a number turned away
	// here could never have been found anyway
	const MOBILE_PATTERN = /^\d{10}$/;

	// a Job Execution's status, as the pill it is shown in
	const EXECUTION_STATUS_COLORS = {
		Running: "orange",
		Completed: "green",
		Cancelled: "red",
	};

	// the tab strip, left to right. `key` is the one get_dashboard answers each
	// tab under (see enquiry_dashboard.py), `columns` what its table shows --
	// `type` decides how a value is formatted, and a numeric one right-aligns it
	// -- and `target` the document a click on one of its rows opens.
	const TABS = [
		{
			key: "enquiries",
			title: __("Enquiries"),
			columns: [
				{ id: "name", name: __("Enquiry"), width: 100 },
				{ id: "date", name: __("Date"), type: "Date", width: 100 },
				{ id: "title", name: __("Title"), width: 180 },
				{ id: "customer_name", name: __("Customer"), width: 180 },
				{ id: "group", name: __("List in"), width: 120 },
				{ id: "assigned_to_name", name: __("Assigned To"), width: 150 },
				{ id: "status", name: __("Status"), width: 110 },
			],
			target: (row) => ["Enquiry", row.name],
		},
		{
			key: "job_activity",
			title: __("Activity"),
			columns: [
				{ id: "creation", name: __("Date / Time"), type: "Datetime", width: 150 },
				{ id: "job_id", name: __("Enquiry"), width: 100 },
				{ id: "job_activity_type", name: __("Activity Type"), width: 130 },
				{ id: "details", name: __("Activity Details"), width: 360 },
				{ id: "owner_name", name: __("By"), width: 150 },
			],
			// an activity is a line in the timeline of the record that posted it,
			// so a click opens that record -- named by the row's Activity ID, which
			// every row still carries though it is no column. one entered by hand
			// has none, and opens itself.
			target: (row) =>
				row.job_activity_type && row.job_activity_id
					? [row.job_activity_type, row.job_activity_id]
					: ["Job Activity", row.name],
		},
		{
			key: "job_execution",
			title: __("Executions"),
			columns: [
				{ id: "name", name: __("Job Execution"), width: 110 },
				{ id: "job_id", name: __("Enquiry"), width: 100 },
				{ id: "date", name: __("Date"), type: "Date", width: 100 },
				{ id: "employee_name", name: __("Employee"), width: 160 },
				{ id: "start_time", name: __("Start Time"), type: "Time", width: 100 },
				{ id: "stop_time", name: __("Stop Time"), type: "Time", width: 100 },
				{ id: "hours", name: __("Hours"), type: "Float", width: 80 },
				{ id: "total_cost", name: __("Total Cost"), type: "Currency", width: 110 },
				{
					id: "status",
					name: __("Status"),
					type: "Status",
					colors: EXECUTION_STATUS_COLORS,
					width: 110,
				},
			],
			target: (row) => ["Job Execution", row.name],
		},
		{
			key: "job_estimate",
			title: __("Estimates"),
			columns: [
				{ id: "name", name: __("Job Estimate"), width: 110 },
				{ id: "job_id", name: __("Enquiry"), width: 100 },
				{ id: "date", name: __("Date"), type: "Date", width: 100 },
				{ id: "item_name", name: __("Item Name"), width: 220 },
				{ id: "supplier_name", name: __("Vendor"), width: 200 },
				{ id: "price", name: __("Price"), type: "Currency", width: 120 },
			],
			target: (row) => ["Job Estimate", row.name],
		},
	];

	// the "+" menu, top to bottom. `open` is handed the dashboard, whose number
	// on screen is the one the new entry is opened on.
	const ADD_ACTIONS = [
		{
			key: "new-enquiry",
			label: __("New Enquiry"),
			open: (dashboard) => dashboard.new_enquiry(),
		},
	];

	// what the mark beside the number says about it: a green tick for a Mobile
	// Contact, a red cross for a number that is not one -- or could not be --
	// and a spinner while that is being asked. no state, no mark.
	const STATUSES = {
		loading: { css: "is-loading", label: __("Looking up...") },
		found: { css: "is-found", icon: "tick", label: __("Mobile Contact found") },
		missing: { css: "is-missing", icon: "cross", label: __("No Mobile Contact for this number") },
		invalid: { css: "is-missing", icon: "cross", label: __("Not a valid 10-digit mobile number") },
	};

	// drawn rather than set as glyphs, which sit on a text baseline and never
	// quite centre in a disc
	const ICONS = {
		tick: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
		cross: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
	};

	// held across on_page_load / on_page_show, which frappe calls separately
	let dashboard = null;

	frappe.pages[PAGE_NAME].on_page_load = function (wrapper) {
		dashboard = new EnquiryDashboard(wrapper);
	};

	frappe.pages[PAGE_NAME].on_page_show = function () {
		if (dashboard) dashboard.on_show();
	};

	class EnquiryDashboard {
		constructor(wrapper) {
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: __("Enquiry Dashboard"),
				single_column: true,
			});

			inject_styles();

			this.$el = $('<div class="logicx-ed"></div>').appendTo(this.page.main).html(render_scaffold());

			this.tables = {};
			// the number searched for last -- what Enter was pressed on, not
			// whatever has been typed since -- and whether it is a Mobile Contact
			this.mobile = "";
			this.found = false;
			// bumped per search so a slow answer for a number the user has
			// already moved on from is dropped instead of landing under the new one
			this.seq = 0;
			// the rows handed to each tab, kept so switching tabs can build the
			// datatable while its pane is actually visible -- frappe-datatable
			// sizes its columns wrong inside a hidden pane. a click on a row is
			// looked up here too (see open_row).
			this.results = {};
			this.active_tab = TABS[0].key;
			// the URL is left alone until the first show has read it: the reset
			// below would otherwise wipe the very number a refresh is meant to
			// bring back (see write_url_params)
			this.url_ready = false;
			// frappe lazy-loads the datatable bundle; the report views await this
			// same call before constructing one, so the page does too
			this.datatable_ready = ensure_datatable();

			this.setup_mobile();
			this.setup_events();
			this.load("");
		}

		/* -------------------------------------------------------------- mobile */

		// a plain Data box: it is read when Enter is pressed rather than on every
		// change, so a half-typed number is never looked up
		setup_mobile() {
			this.mobile_control = frappe.ui.form.make_control({
				parent: this.$el.find('[data-filter="mobile"]'),
				df: {
					fieldname: "mobile",
					label: __("Mobile Number"),
					// the label is off-screen, so the field names itself here
					placeholder: __("Mobile Number"),
					fieldtype: "Data",
				},
				render_input: true,
			});

			const $input = this.mobile_control.$input;
			$input.attr({ inputmode: "numeric", autocomplete: "off" });
			$input.on("keydown", (e) => {
				if (e.key !== "Enter") return;
				e.preventDefault();
				this.search($input.val());
			});

			// the mark sits just outside the box's right edge, centred on it (see
			// the CSS)
			this.$status = $('<span class="logicx-ed-status hidden" role="img"></span>').appendTo(
				this.mobile_control.$wrapper.find(".control-input")
			);
		}

		search(value) {
			const mobile = String(value || "").trim();
			// the box shows what was searched for, spaces and all trimmed off
			this.mobile_control.set_input(mobile);
			this.load(mobile);
		}

		on_show() {
			this.apply_prefill();
			if (!this.mobile) this.mobile_control.$input.trigger("focus");
		}

		apply_prefill() {
			// the router copies the URL's query string into route_options on every
			// route change, so this covers a refresh and the Back button as well
			// as another page routing here with a number already picked. the URL
			// is read directly too, for a desk that does not.
			const from_route = frappe.route_options || {};
			frappe.route_options = null;
			const from_url = frappe.utils.get_query_params() || {};
			this.url_ready = true;

			const mobile = String(from_route.mobile || from_url.mobile || "").trim();

			// nothing asked for, or only what is already on screen -- as on Back to
			// this page, whose URL has followed every search (see load). either way
			// the URL is brought up to date, since arriving from the sidebar clears it.
			if (!mobile || mobile === this.mobile) {
				this.write_url_params();
				return;
			}

			this.mobile_control.set_input(mobile);
			this.load(mobile);
		}

		// the number on screen is kept in the URL as ?mobile=, so a browser
		// refresh, or a link copied from the address bar, opens on it again. the
		// URL is replaced rather than pushed: a search is not a navigation, and
		// Back should leave the page rather than step through every number tried.
		// any other query parameter is left as it was.
		write_url_params() {
			// a search can be answered after the user has already moved on, and
			// the page they are on now has its own URL
			if (!this.url_ready || (frappe.get_route() || [])[0] !== PAGE_NAME) return;

			const params = new URLSearchParams(window.location.search);
			if (this.mobile) params.set("mobile", this.mobile);
			else params.delete("mobile");

			const query = params.toString();
			const search = query ? "?" + query : "";
			if (search === window.location.search) return;
			history.replaceState(history.state, "", window.location.pathname + search + window.location.hash);
		}

		/* ------------------------------------------------------------- loading */

		// everything on the page follows the number searched for: the mark beside
		// it, and every tab. an empty box puts the page back as it opened; a
		// number that is not 10 digits is turned away without asking the server.
		// pressing Enter again on the same number asks again, which is how the
		// page is refreshed.
		load(mobile) {
			this.seq += 1;
			const seq = this.seq;
			this.mobile = mobile;
			this.found = false;
			this.write_url_params();

			if (!mobile) {
				this.set_status(null);
				this.show_notes(__("Enter a mobile number and press Enter."));
				return;
			}
			if (!MOBILE_PATTERN.test(mobile)) {
				this.set_status("invalid");
				this.show_notes(__("Enter a valid 10-digit mobile number (numbers only)."));
				return;
			}

			this.set_status("loading");
			this.show_notes(__("Loading..."));

			frappe
				.call({ method: DASHBOARD_METHOD, args: { mobile } })
				.then((r) => {
					if (seq !== this.seq) return;
					const message = (r && r.message) || {};
					if (!message.found) {
						this.set_status("missing");
						this.show_notes(__("No Mobile Contact found for {0}.", [mobile]));
						return;
					}

					this.found = true;
					this.set_status("found");
					const tabs = message.tabs || {};
					TABS.forEach((tab) => this.set_tab(tab.key, tabs[tab.key] || {}));
				})
				.catch(() => {
					if (seq !== this.seq) return;
					this.set_status(null);
					this.show_notes(__("Could not load the dashboard."), true);
				});
		}

		set_status(state) {
			const status = STATUSES[state];
			this.$status
				.attr("class", "logicx-ed-status " + (status ? status.css : "hidden"))
				.attr("title", status ? status.label : null)
				.attr("aria-label", status ? status.label : null)
				.html(status && status.icon ? ICONS[status.icon] : "");
		}

		/* ---------------------------------------------------------------- tabs */

		setup_events() {
			this.$el.on("click", ".logicx-ed-tab", (e) => {
				this.activate_tab($(e.currentTarget).attr("data-tab"));
			});

			// a row stands for one document, and a click opens it -- in a new
			// browser tab with Ctrl / Cmd held, as a link would. only body rows
			// carry a row index: the header and the inline filter row above them
			// are the table's own.
			this.$el.on("click", ".logicx-ed-card-body.is-table .dt-row[data-row-index]", (e) => {
				const $row = $(e.currentTarget);
				this.open_row(
					$row.closest("[data-pane]").attr("data-pane"),
					Number($row.attr("data-row-index")),
					e.ctrlKey || e.metaKey
				);
			});

			// the "+" menu: the button toggles it, a click anywhere else closes it
			this.$el.on("click", ".logicx-ed-add-btn", (e) => {
				e.stopPropagation();
				this.toggle_add_menu();
			});
			this.$el.on("click", ".logicx-ed-add-menu [data-action]", (e) => {
				e.preventDefault();
				this.toggle_add_menu(false);
				const action = ADD_ACTIONS.find((entry) => entry.key === $(e.currentTarget).attr("data-action"));
				if (action) action.open(this);
			});
			// namespaced so a reload of the page script does not stack a second one
			$(document).off("click.logicx-ed-add").on("click.logicx-ed-add", () => this.toggle_add_menu(false));
		}

		toggle_add_menu(open) {
			const $menu = this.$el.find(".logicx-ed-add-menu");
			const show = open === undefined ? !$menu.hasClass("show") : open;
			$menu.toggleClass("show", show);
			this.$el.find(".logicx-ed-add-btn").attr("aria-expanded", show ? "true" : "false");
		}

		activate_tab(key) {
			if (!key || key === this.active_tab) return;
			this.active_tab = key;

			this.$el.find(".logicx-ed-tab").each(function () {
				$(this).toggleClass("is-active", $(this).attr("data-tab") === key);
			});
			this.$el.find(".logicx-ed-tabpane").each(function () {
				$(this).toggleClass("hidden", $(this).attr("data-pane") !== key);
			});

			// build the datatable now that its pane is visible (see this.results)
			this.render_table(key);
		}

		// the row's index is datatable's own, which stays with the row however
		// the table is sorted or filtered, so it reads straight off the rows the
		// table was built from
		open_row(key, index, in_new_tab) {
			const tab = TABS.find((entry) => entry.key === key);
			const result = this.results[key];
			const row = result && result.seq === this.seq ? result.rows[index] : null;
			if (!tab || !row) return;

			const [doctype, name] = tab.target(row);
			if (in_new_tab) {
				window.open(frappe.utils.get_form_link(doctype, name), "_blank");
				return;
			}
			frappe.set_route("Form", doctype, name);
		}

		/* -------------------------------------------------------------- tables */

		// hand a tab its rows: count them on its tab, remember them, and build the
		// table now only if that tab is the one on screen
		set_tab(key, { rows = [], more = false }) {
			this.results[key] = { rows, seq: this.seq };
			// "500+" when the server stopped short of the rest (see ROW_LIMIT in
			// enquiry_dashboard.py)
			this.set_count(key, more ? `${rows.length}+` : String(rows.length));
			if (key === this.active_tab) this.render_table(key);
		}

		set_count(key, text) {
			this.$el
				.find(`.logicx-ed-tab[data-tab="${key}"] .logicx-ed-count`)
				.text(text)
				.toggleClass("hidden", !text);
		}

		// called both when a result lands and when its tab is opened, whichever
		// comes second; `rendered` is what keeps it from building twice
		render_table(key) {
			const result = this.results[key];
			if (!result || result.seq !== this.seq || result.rendered) return;
			result.rendered = true;

			if (!result.rows.length) {
				this.show_note(key, __("No records"));
				return;
			}

			const seq = this.seq;
			this.datatable_ready.then(() => {
				// the bundle may have loaded while the user moved on to another number
				if (seq !== this.seq) return;
				this.build_table(key, result);
			});
		}

		build_table(key, result) {
			const DataTableClass = frappe.DataTable || window.DataTable;
			if (!DataTableClass) {
				this.show_note(key, __("Could not load this list."), true);
				return;
			}

			const $body = this.$card_body(key);
			this.destroy_table(key);
			$body.empty();

			const tab = TABS.find((entry) => entry.key === key);
			this.tables[key] = new DataTableClass($body.get(0), {
				columns: tab.columns.map(to_datatable_column),
				data: result.rows,
				layout: "fluid",
				inlineFilters: true,
				serialNoColumn: false,
				checkboxColumn: false,
				disableReorderColumn: true,
				noDataMessage: __("No records"),
			});
		}

		destroy_table(key) {
			const table = this.tables[key];
			if (table && typeof table.destroy === "function") table.destroy();
			this.tables[key] = null;
		}

		$card_body(key) {
			return this.$el.find(`[data-pane="${key}"] .logicx-ed-card-body`);
		}

		show_note(key, text, is_error) {
			this.destroy_table(key);
			this.$card_body(key).html(note_html(text, is_error));
		}

		// the same line in every tab, in place of its table, with the counts
		// cleared: nothing is listed until a Mobile Contact has been found
		show_notes(text, is_error) {
			this.results = {};
			TABS.forEach((tab) => {
				this.set_count(tab.key, "");
				this.show_note(tab.key, text, is_error);
			});
		}

		/* ------------------------------------------------------------ add menu */

		// Enquiry's quick entry, on the number on screen when it is a Mobile
		// Contact. once saved, the page moves to the new Enquiry's number -- the
		// one on screen, unless it was changed in the dialog -- so the Enquiry
		// shows up in the first tab rather than the page being left for its form.
		new_enquiry() {
			open_enquiry_quick_entry(this.found ? this.mobile : "", (doc) => {
				frappe.show_alert({
					message: __("Enquiry {0} created", [frappe.utils.get_form_link("Enquiry", doc.name, true)]),
					indicator: "green",
				});
				this.mobile_control.set_input(doc.mobile || "");
				this.load(doc.mobile || "");
			});
		}
	}

	/* ==================================================================== markup */

	// the number at the left of the bar, and the "+" at its right end, level
	// with the bottom of the box
	function render_scaffold() {
		return `
			<div class="logicx-ed-bar">
				<div class="logicx-ed-search" data-filter="mobile"></div>
				${render_add_menu()}
			</div>
			${render_tabcard()}
		`;
	}

	// the round "+" and the menu of what it can open on the number on screen
	// (see ADD_ACTIONS). shown and hidden by hand (see setup_events) rather than
	// by bootstrap's data attributes, so it works the same whichever bootstrap
	// the desk ships; only the .dropdown-menu look and its .show state are
	// borrowed. the "+" is drawn in css, as on the Party Dashboard, and the
	// button's aria-label names it.
	function render_add_menu() {
		const items = ADD_ACTIONS.map(
			(action) => `
					<a class="dropdown-item" href="#" data-action="${action.key}">
						${frappe.utils.escape_html(action.label)}
					</a>`
		).join("");

		return `
			<div class="logicx-ed-add">
				<button type="button" class="btn btn-primary logicx-ed-add-btn"
					title="${__("New")}" aria-label="${__("New")}"
					aria-haspopup="true" aria-expanded="false"></button>
				<div class="dropdown-menu logicx-ed-add-menu">${items}
				</div>
			</div>
		`;
	}

	// each tab carries a count of its rows once they are in (see set_tab)
	function render_tabcard() {
		const buttons = TABS.map(
			(tab, i) => `
			<button type="button" class="logicx-ed-tab${i === 0 ? " is-active" : ""}"
				data-tab="${tab.key}">
				${frappe.utils.escape_html(tab.title)}
				<span class="logicx-ed-count hidden"></span>
			</button>`
		).join("");

		const panes = TABS.map(
			(tab, i) => `
			<div class="logicx-ed-tabpane${i === 0 ? "" : " hidden"}" data-pane="${tab.key}">
				<div class="logicx-ed-card-body is-table"></div>
			</div>`
		).join("");

		return `
			<div class="logicx-ed-tabcard">
				<div class="logicx-ed-tabnav">${buttons}</div>
				${panes}
			</div>`;
	}

	// the muted line a tab shows in place of its table: before a search, while
	// loading, when empty, or in red when the request failed
	function note_html(text, is_error) {
		const css_class = is_error ? "logicx-ed-note is-error" : "logicx-ed-note";
		return `<div class="${css_class}">${frappe.utils.escape_html(text)}</div>`;
	}

	/* ================================================================== add menu */

	// opened through make_quick_entry rather than frappe.new_doc, which takes no
	// after_insert and so opens the saved Enquiry's form instead of telling the
	// page about it. the new document is made here with the number already in
	// it, and its defaults (Date, Priority, Status) applied as new_doc would.
	// should the quick entry fall back to the full form, that form opens on the
	// same document, number and all.
	function open_enquiry_quick_entry(mobile, after_insert) {
		frappe.model.with_doctype("Enquiry", () => {
			const doc = frappe.model.get_new_doc("Enquiry");
			if (mobile) doc.mobile = mobile;
			frappe.ui.form.make_quick_entry("Enquiry", after_insert, limit_mobile_customer, doc);
		});
	}

	// the Enquiry form lists only its Mobile's own Mobile Customers (see
	// enquiry.js), but the quick entry is a dialog that form script never
	// reaches, so the same filter is put on it here. no dialog means the quick
	// entry fell back to the full form, which has the filter already.
	function limit_mobile_customer(dialog) {
		const field = dialog && dialog.fields_dict && dialog.fields_dict.mobile_customer;
		if (!field) return;
		field.get_query = () => ({ filters: { mobile_contact: dialog.get_value("mobile") || "" } });
	}

	/* ==================================================================== tables */

	const RIGHT_ALIGNED = ["Currency", "Float"];

	function to_datatable_column(col) {
		return {
			id: col.id,
			name: col.name,
			width: col.width || 120,
			align: RIGHT_ALIGNED.includes(col.type) ? "right" : "left",
			editable: false,
			focusable: false,
			dropdown: true, // sortable
			sortable: true, // sortable
			format: (value) => format_cell(value, col),
		};
	}

	// every value is escaped on its way in: the rows are whatever was typed
	// into the records they come from
	function format_cell(value, col) {
		if (value === null || value === undefined || value === "") return "";

		switch (col.type) {
			case "Date":
			case "Datetime":
				return frappe.utils.escape_html(frappe.datetime.str_to_user(value));
			case "Time":
				return frappe.utils.escape_html(frappe.datetime.str_to_user(value, true));
			case "Currency":
				return format_currency(value, frappe.defaults.get_default("currency"));
			case "Float":
				return format_number(value, null, 2);
			case "Status": {
				const color = (col.colors && col.colors[value]) || "gray";
				return `<span class="indicator-pill ${color}">${frappe.utils.escape_html(String(value))}</span>`;
			}
			default:
				return text_cell(value);
		}
	}

	// a cell holds one line, cut short with an ellipsis, so the whole of it is
	// kept in the tooltip -- Activity Details in particular runs long
	function text_cell(value) {
		const text = frappe.utils.escape_html(String(value));
		return `<span title="${text}">${text}</span>`;
	}

	function ensure_datatable() {
		if (frappe.DataTable || window.DataTable) return Promise.resolve();
		// frappe.require has taken a callback in some versions and returned a
		// promise in others, so settle on whichever one this build offers --
		// this promise must always resolve or the tabs hang on "Loading..."
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
		.logicx-ed {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
			padding: var(--padding-sm) var(--padding-md) var(--padding-lg);
		}

		/* the number at the left, the "+" pushed to the right end. bottom-aligned,
		   so the "+" stands level with the base of the box. */
		.logicx-ed-bar {
			display: flex;
			align-items: flex-end;
			gap: var(--margin-md);
			padding: var(--padding-md) 0 var(--padding-xs);
		}

		/* the right margin is the room the found / not-found mark takes beside
		   the box (see .logicx-ed-status) */
		.logicx-ed-search {
			flex: 0 1 320px;
			min-width: 160px;
			margin-right: 30px;
		}

		/* frappe's control markup ships its own bottom margin and an empty help
		   line under the box; neither has anything to space here, and either
		   would lift the box off the bottom the "+" is aligned to */
		.logicx-ed-search .frappe-control,
		.logicx-ed-search .form-group {
			margin-bottom: 0;
		}

		.logicx-ed-search .help-box {
			display: none;
		}

		/* the box reads plainly from its placeholder, so its label is dropped
		   from the layout. it stays in the markup, off-screen, so the input
		   keeps an accessible name. */
		.logicx-ed-search .control-label {
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

		.logicx-ed-search .control-input {
			position: relative;
		}

		.logicx-ed-search input {
			font-variant-numeric: tabular-nums;
			letter-spacing: 0.04em;
		}

		/* the found / not-found mark: a disc just past the box's right edge, in
		   the room the search's right margin keeps for it. placed against the
		   input itself, so it centres on the box whatever else the control's
		   markup holds. */
		.logicx-ed-status {
			position: absolute;
			top: 50%;
			left: calc(100% + 8px);
			width: 22px;
			height: 22px;
			border-radius: 50%;
			transform: translateY(-50%);
			display: flex;
			align-items: center;
			justify-content: center;
			color: #fff;
		}

		.logicx-ed-status.hidden {
			display: none;
		}

		.logicx-ed-status svg {
			width: 14px;
			height: 14px;
			fill: none;
			stroke: currentColor;
			stroke-width: 2.25;
			stroke-linecap: round;
			stroke-linejoin: round;
		}

		.logicx-ed-status.is-found {
			background-color: var(--green-500);
		}

		.logicx-ed-status.is-missing {
			background-color: var(--red-500);
		}

		/* a ring with one quarter missing, turning, while the number is looked up */
		.logicx-ed-status.is-loading {
			width: 18px;
			height: 18px;
			margin-left: 2px;
			border: 2px solid var(--gray-300);
			border-top-color: var(--gray-600);
			animation: logicx-ed-spin 0.7s linear infinite;
		}

		@keyframes logicx-ed-spin {
			from { transform: translateY(-50%) rotate(0deg); }
			to { transform: translateY(-50%) rotate(360deg); }
		}

		/* the "+" takes only the room a round button needs, pushed to the far
		   right of the bar where a page's action button sits, and anchors the
		   menu that drops from it. on a narrow screen the box gives way to it. */
		.logicx-ed-add {
			position: relative;
			flex: 0 0 auto;
			margin-left: auto;
			display: flex;
			align-items: center;
		}

		/* as on the Party Dashboard: .btn-primary gives it the desk's action
		   button shape, its colours softened below, and the "+" is two bars
		   crossing at the centre of the disc */
		.logicx-ed-add-btn {
			position: relative;
			width: 34px;
			height: 34px;
			padding: 0;
			border-radius: 50%;
			box-shadow: var(--shadow-sm);
		}

		.logicx-ed-add-btn::before,
		.logicx-ed-add-btn::after {
			content: "";
			position: absolute;
			top: 50%;
			left: 50%;
			width: 16px;
			height: 3px;
			border-radius: 1.5px;
			background-color: currentColor;
			transform: translate(-50%, -50%);
		}

		.logicx-ed-add-btn::after {
			transform: translate(-50%, -50%) rotate(90deg);
		}

		/* !important because frappe's .btn-primary sets its colours on hover,
		   focus and active too, and these should hold through all of them */
		.logicx-ed-add-btn,
		.logicx-ed-add-btn:focus {
			color: var(--gray-300) !important;
			background-color: var(--gray-700) !important;
			border-color: var(--gray-700) !important;
		}

		.logicx-ed-add-btn:hover,
		.logicx-ed-add-btn:active,
		.logicx-ed-add-btn[aria-expanded="true"] {
			color: var(--gray-300) !important;
			background-color: var(--gray-800) !important;
			border-color: var(--gray-800) !important;
		}

		/* pinned under the button's right edge, so it opens inward from the
		   page edge rather than off it */
		.logicx-ed-add-menu {
			top: 100%;
			right: 0;
			left: auto;
			margin-top: 4px;
			min-width: 180px;
		}

		.logicx-ed-add-menu.show {
			display: block;
		}

		.logicx-ed-tabnav {
			display: flex;
			flex-wrap: wrap;
			gap: var(--margin-lg);
			border-bottom: 1px solid var(--border-color);
		}

		.logicx-ed-tab {
			appearance: none;
			background: none;
			border: none;
			border-bottom: 2px solid transparent;
			margin-bottom: -1px;
			padding: var(--padding-md) 2px;
			font-size: var(--text-md);
			font-weight: 600;
			color: var(--text-muted);
			cursor: pointer;
			white-space: nowrap;
		}

		.logicx-ed-tab:hover {
			color: var(--text-color);
		}

		.logicx-ed-tab.is-active {
			color: var(--text-color);
			border-bottom-color: var(--primary, var(--text-color));
		}

		.logicx-ed-count {
			display: inline-block;
			min-width: 20px;
			margin-left: 4px;
			padding: 0 6px;
			border-radius: 10px;
			background-color: var(--gray-100);
			color: var(--text-muted);
			font-size: var(--text-xs);
			font-weight: 600;
			line-height: 18px;
			text-align: center;
			font-variant-numeric: tabular-nums;
		}

		/* frappe's desk CSS defines .hidden too; repeated here so what the tabs
		   show never depends on that global staying put */
		.logicx-ed-count.hidden,
		.logicx-ed-tabpane.hidden {
			display: none;
		}

		.logicx-ed-tabpane {
			padding-top: var(--padding-md);
		}

		/* the datatable brings its own padding, so its body has none, and is
		   clipped to the outline it is read inside */
		.logicx-ed-card-body.is-table {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			overflow: hidden;
		}

		.logicx-ed-card-body.is-table .datatable {
			border: none;
		}

		/* every body row opens the document it stands for (see open_row) */
		.logicx-ed-card-body.is-table .dt-row[data-row-index] {
			cursor: pointer;
		}

		.logicx-ed-card-body.is-table .dt-row[data-row-index]:hover .dt-cell {
			background-color: var(--fg-hover-color, var(--gray-100));
		}

		/* each list scrolls inside its own outline instead of stretching the
		   page. max-height rather than height so a short list still shrinks to
		   fit; !important because frappe-datatable sets its own height inline. */
		.logicx-ed-card-body.is-table .dt-scrollable {
			max-height: 33333px !important;
			overflow-y: auto !important;
		}

		.logicx-ed-note {
			padding: var(--padding-lg);
			font-size: var(--text-md);
			color: var(--text-muted);
			text-align: center;
		}

		.logicx-ed-note.is-error {
			color: var(--red-500);
		}
	`;
})();
