(function () {
	const PAGE_NAME = "party-page";
	const BILL_WISE_STATEMENT_REPORT = "Party Bill-wise Statement";
	const LEDGER_STATEMENT_REPORT = "Party Statement";
	const NOT_RECONCILED_REPORT = "Party Not Reconciled";
	const PARTY_TYPES = ["Customer", "Supplier"];
	const RIGHT_ALIGNED = ["Currency", "Float", "Int", "Percent"];
	const PARTY_DEBOUNCE_MS = 300;
	const STYLE_ID = "logicx-party-page-styles";

	const TILES = [
		{ key: "outstanding", label: __("Outstanding") },
		{ key: "bills", label: __("Bills") },
		{ key: "not_reconciled", label: __("Not Reconciled") },
		{ key: "last_invoice", label: __("Last Invoice") },
		{ key: "last_payment", label: __("Last Payment") },
	];

	const CARDS = [
		{ key: "bill_wise_statement", title: __("Statement: Bill-wise"), report: BILL_WISE_STATEMENT_REPORT },
		{ key: "ledger_statement", title: __("Statement: Ledger"), report: LEDGER_STATEMENT_REPORT },
	];

	// held across on_page_load / on_page_show, which frappe calls separately
	let state = null;

	frappe.pages[PAGE_NAME].on_page_load = function (wrapper) {
		state = build(wrapper);
	};

	frappe.pages[PAGE_NAME].on_page_show = function () {
		if (state) apply_prefill(state);
	};

	function build(wrapper) {
		const page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Party Page"),
			single_column: true,
		});

		inject_styles();

		const $el = $('<div class="logicx-pp"></div>').appendTo(page.main);
		$el.html(render_scaffold());

		const built = {
			page: page,
			$el: $el,
			controls: {},
			tables: {},
			party_type: PARTY_TYPES[0],
			party: "",
			// bumped per load so a slow response for a party the user has already
			// moved on from can be dropped instead of landing under the new name
			request_seq: 0,
			// the last result handed to each statement card, kept so switching tabs
			// can (re)build the datatable while its pane is actually visible --
			// frappe-datatable sizes its columns wrong when built inside a hidden pane
			pending: {},
			active_tab: CARDS[0].key,
			url_params_read: false,
			// frappe lazy-loads the datatable bundle; the report views await this
			// same call before constructing one, so the page does too
			datatable_ready: ensure_datatable(),
		};

		setup_filters(built);
		setup_open_report_links(built);
		setup_tabs(built);
		load(built, built.party_type, "");

		return built;
	}

	function render_scaffold() {
		const tiles = TILES.map(
			(tile) => `
			<div class="logicx-pp-card logicx-pp-tile" data-tile="${tile.key}">
				<div class="logicx-pp-tile-label">${frappe.utils.escape_html(tile.label)}</div>
				<div class="logicx-pp-tile-value">&ndash;</div>
				<div class="logicx-pp-tile-caption"></div>
			</div>`
		).join("");

		const tab_buttons = CARDS.map(
			(card, i) => `
			<button type="button" class="logicx-pp-tab${i === 0 ? " is-active" : ""}"
				data-tab="${card.key}">
				${frappe.utils.escape_html(card.title)}
			</button>`
		).join("");

		const tab_panes = CARDS.map(
			(card, i) => `
			<div class="logicx-pp-tabpane${i === 0 ? "" : " hidden"}" data-report="${card.key}">
				<div class="logicx-pp-card-body is-table"></div>
			</div>`
		).join("");

		// one "Open full report" link lives in the tab nav and is repointed at the
		// active tab's report (see activate_tab); the click handler reads
		// data-report-name at click time
		const tabs = `
			<div class="logicx-pp-card logicx-pp-tabcard">
				<div class="logicx-pp-tabnav">
					<div class="logicx-pp-tabnav-tabs">${tab_buttons}</div>
					<a href="#" class="logicx-pp-open-report hidden"
						data-report-name="${frappe.utils.escape_html(CARDS[0].report)}">
						${__("Open full report")} &#8599;
					</a>
				</div>
				${tab_panes}
			</div>`;

		return `
			<div class="logicx-pp-card">
				<div class="logicx-pp-card-body">
					<div class="logicx-pp-filters">
						<div class="logicx-pp-filter" data-filter="party_type"></div>
						<div class="logicx-pp-filter" data-filter="party"></div>
					</div>
				</div>
			</div>
			<div class="logicx-pp-stats">${tiles}</div>
			${tabs}
		`;
	}

	function setup_filters(state) {
		state.controls.party_type = frappe.ui.form.make_control({
			parent: state.$el.find('[data-filter="party_type"]'),
			df: {
				fieldname: "party_type",
				label: __("Party Type"),
				fieldtype: "Select",
				options: PARTY_TYPES.join("\n"),
				change: function () {
					on_party_type_change(state);
				},
			},
			render_input: true,
		});
		state.controls.party_type.set_value(PARTY_TYPES[0]);

		// a standalone control has no sibling field to hang a Dynamic Link off,
		// so this is a plain Link that gets repointed whenever the party type
		// changes (see on_party_type_change below)
		state.controls.party = frappe.ui.form.make_control({
			parent: state.$el.find('[data-filter="party"]'),
			df: {
				fieldname: "party",
				label: __("Party"),
				fieldtype: "Link",
				options: PARTY_TYPES[0],
				change: frappe.utils.debounce(function () {
					reload(state);
				}, PARTY_DEBOUNCE_MS),
			},
			render_input: true,
		});
	}

	function on_party_type_change(state) {
		const party_type = get_party_type(state);
		// the selected party belongs to the previous party type, so clear it and
		// repoint the link at the new doctype before reloading
		state.controls.party.df.options = party_type;
		state.controls.party.set_value("");
		state.controls.party.refresh();
		load(state, party_type, "");
	}

	function get_party_type(state) {
		const value = state.controls.party_type.get_value();
		return PARTY_TYPES.includes(value) ? value : PARTY_TYPES[0];
	}

	function reload(state) {
		load(state, get_party_type(state), (state.controls.party.get_value() || "").trim());
	}

	function apply_prefill(state) {
		const from_route = frappe.route_options || {};
		frappe.route_options = null;

		// URL params are read once, on the first show -- the desk keeps the query
		// string around as you navigate away and back, and re-applying it would
		// silently undo whatever the user picked in the meantime
		const from_url = state.url_params_read ? {} : frappe.utils.get_query_params() || {};
		state.url_params_read = true;

		const party_type = from_route.party_type || from_url.party_type;
		const party = from_route.party || from_url.party;
		if (!party_type && !party) return;

		// party_type first: it repoints the party link at the right doctype, and
		// clears any party already selected
		if (party_type && PARTY_TYPES.includes(party_type)) {
			state.controls.party_type.set_value(party_type);
			state.controls.party.df.options = party_type;
			state.controls.party.refresh();
		}
		if (party) state.controls.party.set_value(party);

		reload(state);
	}

	function load(state, party_type, party) {
		const seq = ++state.request_seq;
		state.party_type = party_type;
		state.party = party;
		state.pending = {};
		state.$el.find(".logicx-pp-open-report").toggleClass("hidden", !party);

		if (!party) {
			TILES.forEach((tile) => set_tile(state, tile.key, "&ndash;", ""));
			CARDS.forEach((card) => show_note(state, card.key, __("Select a party to begin.")));
			return;
		}

		TILES.forEach((tile) => state.$el.find(`[data-tile="${tile.key}"]`).addClass("is-loading"));
		CARDS.forEach((card) => show_note(state, card.key, __("Loading...")));

		run_report(BILL_WISE_STATEMENT_REPORT, party_type, party)
			.then((message) => {
				if (seq !== state.request_seq) return;
				const columns = message.columns || [];
				const rows = to_row_objects(columns, message.result || []);
				render_card(state, "bill_wise_statement", columns, rows, seq);
				set_outstanding_tiles(state, rows);
			})
			.catch(() => {
				if (seq !== state.request_seq) return;
				show_note(state, "bill_wise_statement", __("Could not load this statement."), true);
				set_tile(state, "outstanding", "&ndash;", "");
				set_tile(state, "bills", "&ndash;", "");
			});

		run_report(LEDGER_STATEMENT_REPORT, party_type, party)
			.then((message) => {
				if (seq !== state.request_seq) return;
				const columns = message.columns || [];
				render_card(state, "ledger_statement", columns, to_row_objects(columns, message.result || []), seq);
			})
			.catch(() => {
				if (seq !== state.request_seq) return;
				show_note(state, "ledger_statement", __("Could not load this statement."), true);
			});

		// the Not Reconciled tile is fed by the report of the same name, so the two
		// can never disagree -- same reason Outstanding/Bills come off the bill-wise
		// result rather than being recomputed here
		run_report(NOT_RECONCILED_REPORT, party_type, party)
			.then((message) => {
				if (seq !== state.request_seq) return;
				set_not_reconciled_tile(
					state,
					to_row_objects(message.columns || [], message.result || [])
				);
			})
			.catch(() => {
				if (seq !== state.request_seq) return;
				set_tile(state, "not_reconciled", "&ndash;", "");
			});

		frappe
			.call({
				method: "logicx_biz.logicx_erp.party_page.get_party_activity",
				args: { party_type: party_type, party: party },
			})
			.then((r) => {
				if (seq !== state.request_seq) return;
				set_activity_tiles(state, (r && r.message) || {});
			})
			.catch(() => {
				if (seq !== state.request_seq) return;
				set_tile(state, "last_invoice", "&ndash;", "");
				set_tile(state, "last_payment", "&ndash;", "");
			});
	}

	function run_report(report_name, party_type, party) {
		return frappe
			.call({
				method: "frappe.desk.query_report.run",
				type: "GET",
				args: {
					report_name: report_name,
					filters: { party_type: party_type, party: party },
					ignore_prepared_report: 1,
					are_default_filters: false,
				},
			})
			.then((r) => (r && r.message) || {});
	}

	// script reports here return dicts, but query_report.run can hand back plain
	// arrays too, so normalise to one shape the formatters can rely on
	function to_row_objects(columns, result) {
		return result.map((row) => {
			if (!Array.isArray(row)) return row;
			const obj = {};
			columns.forEach((col, i) => {
				obj[col.fieldname] = row[i];
			});
			return obj;
		});
	}

	function setup_tabs(state) {
		// delegated from the page wrapper so the handler survives every re-render
		state.$el.on("click", ".logicx-pp-tab", function () {
			activate_tab(state, $(this).attr("data-tab"));
		});
	}

	function activate_tab(state, key) {
		if (!key || key === state.active_tab) return;
		state.active_tab = key;

		state.$el.find(".logicx-pp-tab").each(function () {
			$(this).toggleClass("is-active", $(this).attr("data-tab") === key);
		});
		state.$el.find(".logicx-pp-tabpane").each(function () {
			$(this).toggleClass("hidden", $(this).attr("data-report") !== key);
		});

		// repoint the shared "Open full report" link at the now-visible report
		const card = CARDS.find((c) => c.key === key);
		if (card) {
			state.$el.find(".logicx-pp-open-report").attr("data-report-name", card.report);
		}

		// build the datatable now that its pane is visible (see pending in build)
		render_pending(state, key);
	}

	// hand a result to a statement card: remember it, and build the table now only
	// if that card's tab is the one on screen
	function render_card(state, key, columns, rows, seq) {
		state.pending[key] = { columns: columns, rows: rows, seq: seq };
		if (key === state.active_tab) render_table(state, key, columns, rows, seq);
	}

	function render_pending(state, key) {
		const p = state.pending[key];
		if (!p || p.seq !== state.request_seq) return;
		render_table(state, key, p.columns, p.rows, p.seq);
	}

	function render_table(state, key, columns, rows, seq) {
		if (!rows.length) {
			show_note(state, key, __("No records"));
			return;
		}

		state.datatable_ready.then(function () {
			// the bundle may have loaded while the user moved on to another party
			if (seq !== state.request_seq) return;
			build_table(state, key, columns, rows);
		});
	}

	function build_table(state, key, columns, rows) {
		const DataTableClass = get_datatable_class();
		if (!DataTableClass) {
			show_note(state, key, __("Could not load this statement."), true);
			return;
		}

		const $body = get_card_body(state, key);
		destroy_table(state, key);
		$body.empty();

		const dt_columns = columns.map((col) => ({
			id: col.fieldname,
			name: col.label,
			width: col.width || 120,
			align: RIGHT_ALIGNED.includes(col.fieldtype) ? "right" : "left",
			editable: false,
			focusable: false,
			dropdown: false,
			format: function (value, row, column, data) {
				return format_cell(value, col, data);
			},
		}));

		state.tables[key] = new DataTableClass($body.get(0), {
			columns: dt_columns,
			data: rows,
			layout: "fluid",
			inlineFilters: false,
			serialNoColumn: false,
			checkboxColumn: false,
			disableReorderColumn: true,
			dynamicRowHeight: true,
			noDataMessage: __("No records"),
		});
	}

	function get_datatable_class() {
		return frappe.DataTable || window.DataTable;
	}

	function ensure_datatable() {
		if (get_datatable_class()) return Promise.resolve();
		// frappe.require has taken a callback in some versions and returned a
		// promise in others, so settle on whichever one this build offers --
		// this promise must always resolve or the cards hang on "Loading..."
		return new Promise(function (resolve) {
			try {
				const loading = frappe.require("data_table.bundle.js", resolve);
				if (loading && typeof loading.then === "function") loading.then(resolve, resolve);
			} catch (e) {
				resolve();
			}
		});
	}

	function format_cell(value, col, data) {
		let html = frappe.format(value, col, { always_show_decimals: true }, data);
		html = open_links_in_new_tab(html);
		// both report .py files mark their Total / Closing Balance rows with bold: 1
		if (data && data.bold) {
			html = `<span class="logicx-pp-bold">${html}</span>`;
		}
		return html;
	}

	// same convention as commit 0b1967f: party links open in their own tab rather
	// than replacing the page you are working from
	function open_links_in_new_tab(html) {
		if (typeof html !== "string" || html.indexOf("<a ") === -1) return html;
		return html.replace(/<a\s/g, '<a target="_blank" rel="noopener" ');
	}

	function destroy_table(state, key) {
		const table = state.tables[key];
		if (table && typeof table.destroy === "function") table.destroy();
		state.tables[key] = null;
	}

	function get_card_body(state, key) {
		return state.$el.find(`[data-report="${key}"] .logicx-pp-card-body`);
	}

	function show_note(state, key, text, is_error) {
		destroy_table(state, key);
		const css_class = is_error ? "logicx-pp-note is-error" : "logicx-pp-note";
		get_card_body(state, key).html(
			`<div class="${css_class}">${frappe.utils.escape_html(text)}</div>`
		);
	}

	function set_outstanding_tiles(state, rows) {
		// the report appends its own bold Total row; reading the tiles off that
		// same result is what keeps them in step with the table underneath
		const total_row = rows.find((row) => row.bold);
		const bill_rows = rows.filter((row) => !row.bold);
		const outstanding = total_row ? total_row.outstanding_value || 0 : 0;

		set_tile(state, "outstanding", frappe.format(outstanding, { fieldtype: "Currency" }), "");
		set_tile(state, "bills", String(bill_rows.length), __("pending"));
	}

	function set_not_reconciled_tile(state, rows) {
		// Party Not Reconciled lists a party only when BOTH sides are still open
		// (its HAVING clause), so no row back means this party has nothing left
		// to reconcile -- not that the query failed
		const row = rows[0];
		if (!row) {
			set_tile(state, "not_reconciled", "&ndash;", __("nothing open"));
			return;
		}

		const debit = format_amount(row.debit_non_reconciled);
		const credit = format_amount(row.credit_non_reconciled);
		const html =
			`<span class="logicx-pp-amount">${debit} ${__("Dr")}</span>` +
			'<span class="logicx-pp-amount-sep">|</span>' +
			`<span class="logicx-pp-amount">${credit} ${__("Cr")}</span>`;
		set_tile(state, "not_reconciled", html, "");
	}

	// plain grouped number rather than a currency string: the Dr/Cr suffix already
	// says what it is, and two symbols would not fit the tile
	function format_amount(value) {
		const amount = value || 0;
		if (typeof format_number === "function") return format_number(amount, null, 2);
		return frappe.format(amount, { fieldtype: "Float" });
	}

	function set_activity_tiles(state, activity) {
		set_days_tile(state, "last_invoice", activity.last_invoice_days, activity.last_invoice_date);
		set_days_tile(state, "last_payment", activity.last_payment_days, activity.last_payment_date);
	}

	function set_days_tile(state, key, days, date) {
		if (days === null || days === undefined) {
			set_tile(state, key, "&ndash;", __("none"));
			return;
		}
		const caption = `${__("days")} \u00b7 ${frappe.datetime.str_to_user(date)}`;
		set_tile(state, key, frappe.utils.escape_html(String(days)), caption);
	}

	function set_tile(state, key, value_html, caption) {
		const $tile = state.$el.find(`[data-tile="${key}"]`);
		$tile.removeClass("is-loading");
		$tile.find(".logicx-pp-tile-value").html(value_html);
		$tile.find(".logicx-pp-tile-caption").text(caption || "");
	}

	function setup_open_report_links(state) {
		// delegated from the page wrapper so the handler survives every re-render
		state.$el.on("click", ".logicx-pp-open-report", function (e) {
			e.preventDefault();
			if (!state.party) return;
			open_report_in_new_tab($(this).attr("data-report-name"), state.party_type, state.party);
		});
	}

	// open `report_name` in a new browser tab with the current party prefilled.
	// frappe.route_options can't survive window.open (a fresh document), so the
	// filters ride along as URL query params instead -- party_type before party,
	// the order the target report's party_type on_change depends on
	function open_report_in_new_tab(report_name, party_type, party) {
		const params = $.param({ party_type: party_type, party: party });
		const url = "/app/query-report/" + encodeURIComponent(report_name) + "?" + params;
		window.open(url, "_blank");
	}

	// the styles live here rather than in a sibling party_page.css because a
	// standard Page's .css asset is not reliably served across frappe versions,
	// and the same injected-<style> approach is what logicx_dashboard.js and the
	// report JS in this app already use. textContent is re-set on every load so
	// edits to this file take effect without a hard browser reload.
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
		.logicx-pp {
			display: flex;
			flex-direction: column;
			gap: var(--margin-md);
			padding-bottom: var(--padding-lg);
		}

		.logicx-pp-card {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
		}

		.logicx-pp-card-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--margin-sm);
			padding: var(--padding-md) var(--padding-lg);
			border-bottom: 1px solid var(--border-color);
		}

		.logicx-pp-card-title {
			font-size: var(--text-md);
			font-weight: 600;
			color: var(--text-color);
		}

		.logicx-pp-card-body {
			padding: var(--padding-md) var(--padding-lg);
		}

		/* the datatable brings its own padding, so its card body has none */
		.logicx-pp-card-body.is-table {
			padding: 0;
		}

		.logicx-pp-filters {
			display: flex;
			flex-wrap: wrap;
			gap: var(--margin-md);
		}

		.logicx-pp-filter {
			flex: 1 1 240px;
			min-width: 200px;
			max-width: 360px;
		}

		/* frappe's control markup ships its own bottom margin; the flex gap above
		   already spaces these, so drop it */
		.logicx-pp-filter .frappe-control {
			margin-bottom: 0;
		}

		.logicx-pp-filter .control-label {
			font-size: 11px;
			font-weight: 600;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--text-muted);
			margin-bottom: var(--margin-xs);
		}

		.logicx-pp-stats {
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			gap: var(--margin-md);
		}

		@media (max-width: 1400px) {
			.logicx-pp-stats {
				grid-template-columns: repeat(3, minmax(0, 1fr));
			}
		}

		@media (max-width: 900px) {
			.logicx-pp-stats {
				grid-template-columns: repeat(2, minmax(0, 1fr));
			}
		}

		@media (max-width: 520px) {
			.logicx-pp-stats {
				grid-template-columns: minmax(0, 1fr);
			}
		}

		.logicx-pp-tile {
			padding: var(--padding-md) var(--padding-lg);
		}

		.logicx-pp-tile-label {
			font-size: 11px;
			font-weight: 600;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--text-muted);
			margin-bottom: var(--margin-xs);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.logicx-pp-tile-value {
			font-size: 26px;
			line-height: 1.15;
			font-weight: 600;
			color: var(--text-color);
			font-variant-numeric: tabular-nums;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		/* two figures share this tile, so it steps down a size to fit them */
		[data-tile="not_reconciled"] .logicx-pp-tile-value {
			font-size: 17px;
			line-height: 1.75;
		}

		.logicx-pp-amount-sep {
			color: var(--text-muted);
			font-weight: 400;
			margin: 0 6px;
		}

		.logicx-pp-tile-caption {
			margin-top: 2px;
			font-size: var(--text-sm);
			color: var(--text-muted);
			min-height: 1.2em;
		}

		/* skeleton shown while a tile is waiting on its request */
		.logicx-pp-tile.is-loading .logicx-pp-tile-value,
		.logicx-pp-tile.is-loading .logicx-pp-tile-caption {
			color: transparent;
			background-color: var(--skeleton-bg, var(--bg-color));
			border-radius: var(--border-radius-sm);
			animation: logicx-pp-pulse 1.4s ease-in-out infinite;
		}

		.logicx-pp-tile.is-loading .logicx-pp-tile-caption {
			max-width: 60px;
		}

		@keyframes logicx-pp-pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.45; }
		}

		/* tab strip that fronts the two statement cards; it stands in for the
		   per-card title bar the cards used to carry */
		.logicx-pp-tabnav {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--margin-md);
			padding: 0 var(--padding-lg);
			border-bottom: 1px solid var(--border-color);
		}

		.logicx-pp-tabnav-tabs {
			display: flex;
			gap: var(--margin-lg);
			flex-wrap: wrap;
		}

		.logicx-pp-tab {
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

		.logicx-pp-tab:hover {
			color: var(--text-color);
		}

		.logicx-pp-tab.is-active {
			color: var(--text-color);
			border-bottom-color: var(--primary, var(--text-color));
		}

		.logicx-pp-tabpane.hidden {
			display: none;
		}

		.logicx-pp-open-report {
			font-size: var(--text-sm);
			color: var(--text-muted);
			white-space: nowrap;
		}

		.logicx-pp-open-report:hover {
			color: var(--text-color);
			text-decoration: none;
		}

		/* frappe's desk CSS defines .hidden too; repeated here so the link's
		   visibility never depends on that global staying put */
		.logicx-pp-open-report.hidden {
			display: none;
		}

		/* the report .py files mark their Total / Closing Balance rows with bold: 1 */
		.logicx-pp-bold {
			font-weight: 600;
		}

		/* inline empty / error / loading line inside a table card */
		.logicx-pp-note {
			padding: var(--padding-lg);
			font-size: var(--text-md);
			color: var(--text-muted);
			text-align: center;
		}

		.logicx-pp-note.is-error {
			color: var(--red-500);
		}

		/* frappe-datatable draws its own borders; the card already supplies the
		   outer one, and the rounded bottom corners need to clip the last row */
		.logicx-pp-card-body.is-table .datatable {
			border: none;
			border-bottom-left-radius: var(--border-radius-md);
			border-bottom-right-radius: var(--border-radius-md);
			overflow: hidden;
		}

		/* Party Bill-wise Statement labels a column "Outstanding<br>Value".
		   frappe-datatable truncates header labels with an ellipsis and offers no
		   wrap option, so allow wrapping the same way wrap_column_headers() does
		   in the report JS. */
		.logicx-pp-card-body.is-table .dt-header .dt-row-header,
		.logicx-pp-card-body.is-table .dt-header .dt-row-header .dt-cell--header {
			height: 50px !important;
		}

		.logicx-pp-card-body.is-table .dt-header .dt-cell--header .dt-cell__content {
			white-space: normal !important;
			overflow-wrap: break-word;
			text-overflow: clip;
			height: 100% !important;
			display: flex;
			align-items: flex-end;
		}

		/* each statement scrolls inside its own card instead of stretching the
		   page, so the stat tiles above stay in view while you read down a long
		   ledger. max-height rather than height so a short result still shrinks to
		   fit; !important because frappe-datatable sets its own height inline. */
		.logicx-pp-card-body.is-table .dt-scrollable {
			max-height: 33333px !important;
			overflow-y: auto !important;
		}
	`;
})();
