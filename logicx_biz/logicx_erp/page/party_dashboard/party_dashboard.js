(function () {
	const PAGE_NAME = "party-dashboard";
	const BILL_WISE_STATEMENT_REPORT = "Party Bill-wise Statement";
	const LEDGER_STATEMENT_REPORT = "Party Statement";
	const PAYMENT_WISE_NON_RECONCILED_REPORT = "Party Payment-wise Non-Reconciled";
	const PARTY_TYPES = ["Customer", "Supplier"];
	const RIGHT_ALIGNED = ["Currency", "Float", "Int", "Percent"];
	const PARTY_DEBOUNCE_MS = 300;
	const STYLE_ID = "logicx-party-dashboard-styles";

	// the first three tiles are read off the same result that fills the tab below
	// them, so a tile can never disagree with the table it summarises -- and `tab`
	// sends a click on the tile to that same card. the activity tiles have no
	// statement of their own, so they fall back to the ledger.
	const TILES = [
		{ key: "outstanding", label: __("Outstanding"), tab: "ledger_statement" },
		{ key: "bills", label: __("UnReconciled Bills"), tab: "bill_wise_statement" },
		{ key: "not_reconciled", label: __("UnReconciled Payments"), tab: "payment_wise_non_reconciled" },
		{ key: "last_invoice", label: __("Last Invoice"), tab: "ledger_statement" },
		{ key: "last_payment", label: __("Last Payment"), tab: "ledger_statement" },
	];

	const CARDS = [
		{ key: "bill_wise_statement", title: __("UnReconciled\nBills"), report: BILL_WISE_STATEMENT_REPORT },
		{ key: "payment_wise_non_reconciled", title: __("UnReconciled\nPayments"), report: PAYMENT_WISE_NON_RECONCILED_REPORT },
		{ key: "ledger_statement", title: __("Statement"), report: LEDGER_STATEMENT_REPORT },
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
			title: __("Party Dashboard"),
			single_column: true,
		});

		inject_styles();

		const $el = $('<div class="logicx-pd"></div>').appendTo(page.main);
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

	// a card title may carry a line break; escape_html would print a literal
	// "<br>", so escape each line and join them with a real one
	function escape_lines(text) {
		return String(text).split("\n").map(frappe.utils.escape_html).join("<br>");
	}

	function render_scaffold() {
		const tiles = TILES.map(
			(tile) => `
			<div class="logicx-pd-card logicx-pd-tile" data-tile="${tile.key}"
				data-tab="${tile.tab}" role="button" tabindex="0">
				<div class="logicx-pd-tile-label">${frappe.utils.escape_html(tile.label)}</div>
				<div class="logicx-pd-tile-value">&ndash;</div>
				<div class="logicx-pd-tile-caption"></div>
			</div>`
		).join("");

		const tab_buttons = CARDS.map(
			(card, i) => `
			<button type="button" class="logicx-pd-tab${i === 0 ? " is-active" : ""}"
				data-tab="${card.key}">
				${escape_lines(card.title)}
			</button>`
		).join("");

		const tab_panes = CARDS.map(
			(card, i) => `
			<div class="logicx-pd-tabpane${i === 0 ? "" : " hidden"}" data-report="${card.key}">
				<div class="logicx-pd-card-body is-table"></div>
			</div>`
		).join("");

		// one "Open full report" link lives in the tab nav and is repointed at the
		// active tab's report (see activate_tab); the click handler reads
		// data-report-name at click time
		const tabs = `
			<div class="logicx-pd-card logicx-pd-tabcard">
				<div class="logicx-pd-tabnav">
					<div class="logicx-pd-tabnav-tabs">${tab_buttons}</div>
					<a href="#" class="logicx-pd-open-report hidden"
						data-report-name="${frappe.utils.escape_html(CARDS[0].report)}">
						${__("Open full report")} &#8599;
					</a>
				</div>
				${tab_panes}
			</div>`;

		return `
			<div class="logicx-pd-card">
				<div class="logicx-pd-card-body">
					<div class="logicx-pd-filters">
						<div class="logicx-pd-filter" data-filter="party_type"></div>
						<div class="logicx-pd-filter" data-filter="party"></div>
					</div>
				</div>
			</div>
			<div class="logicx-pd-stats">${tiles}</div>
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
		state.$el.find(".logicx-pd-open-report").toggleClass("hidden", !party);

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
				set_bills_tile(state, rows, party_type);
			})
			.catch(() => {
				if (seq !== state.request_seq) return;
				show_note(state, "bill_wise_statement", __("Could not load this statement."), true);
				set_tile(state, "bills", "&ndash;", "");
			});

		// the payments side of the same reconciliation the bill-wise tab shows the
		// bills side of
		run_report(PAYMENT_WISE_NON_RECONCILED_REPORT, party_type, party)
			.then((message) => {
				if (seq !== state.request_seq) return;
				const columns = message.columns || [];
				const rows = to_row_objects(columns, message.result || []);
				render_card(state, "payment_wise_non_reconciled", columns, rows, seq);
				set_not_reconciled_tile(state, rows, party_type);
			})
			.catch(() => {
				if (seq !== state.request_seq) return;
				show_note(state, "payment_wise_non_reconciled", __("Could not load this statement."), true);
				set_tile(state, "not_reconciled", "&ndash;", "");
			});

		run_report(LEDGER_STATEMENT_REPORT, party_type, party)
			.then((message) => {
				if (seq !== state.request_seq) return;
				const columns = message.columns || [];
				const rows = to_row_objects(columns, message.result || []);
				render_card(state, "ledger_statement", columns, rows, seq);
				set_outstanding_tile(state, rows, party_type);
			})
			.catch(() => {
				if (seq !== state.request_seq) return;
				show_note(state, "ledger_statement", __("Could not load this statement."), true);
				set_tile(state, "outstanding", "&ndash;", "");
			});

		frappe
			.call({
				method: "logicx_biz.logicx_erp.party_dashboard.get_party_activity",
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
		// delegated from the page wrapper so the handlers survive every re-render
		state.$el.on("click", ".logicx-pd-tab, .logicx-pd-tile", function () {
			if (open_voucher($(this))) return;
			activate_tab(state, $(this).attr("data-tab"));
		});

		// the tabs are real buttons, but the tiles are divs, so Enter and Space have
		// to be wired up by hand to match the role they now advertise
		state.$el.on("keydown", ".logicx-pd-tile", function (e) {
			if (e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			if (open_voucher($(this))) return;
			activate_tab(state, $(this).attr("data-tab"));
		});
	}

	// an activity tile stands for one document, so it opens that document instead
	// of the tab it would otherwise switch to. returns whether it handled the
	// press, so a tile with nothing to open still falls back to its tab.
	function open_voucher($tile) {
		const voucher_type = $tile.attr("data-voucher-type");
		const voucher_no = $tile.attr("data-voucher-no");
		if (!voucher_type || !voucher_no) return false;
		frappe.set_route("Form", voucher_type, voucher_no);
		return true;
	}

	function activate_tab(state, key) {
		if (!key || key === state.active_tab) return;
		state.active_tab = key;

		state.$el.find(".logicx-pd-tab").each(function () {
			$(this).toggleClass("is-active", $(this).attr("data-tab") === key);
		});
		state.$el.find(".logicx-pd-tabpane").each(function () {
			$(this).toggleClass("hidden", $(this).attr("data-report") !== key);
		});

		// repoint the shared "Open full report" link at the now-visible report
		const card = CARDS.find((c) => c.key === key);
		if (card) {
			state.$el.find(".logicx-pd-open-report").attr("data-report-name", card.report);
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
			dropdown: true, // sortable
			sortable: true, // sortable
			format: function (value, row, column, data) {
				return format_cell(value, col, data);
			},
		}));

		state.tables[key] = new DataTableClass($body.get(0), {
			columns: dt_columns,
			data: rows,
			layout: "fluid",
			inlineFilters: true,
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
			html = `<span class="logicx-pd-bold">${html}</span>`;
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
		return state.$el.find(`[data-report="${key}"] .logicx-pd-card-body`);
	}

	function show_note(state, key, text, is_error) {
		destroy_table(state, key);
		const css_class = is_error ? "logicx-pd-note is-error" : "logicx-pd-note";
		get_card_body(state, key).html(
			`<div class="${css_class}">${frappe.utils.escape_html(text)}</div>`
		);
	}

	// the ledger's own closing balance rather than the bill-wise total, so advances
	// and anything else that never sat against a bill are counted
	function set_outstanding_tile(state, rows, party_type) {
		// party_statement.py appends Total and then Closing Balance, both marked
		// bold, so the balance is the last row rather than the first bold one
		const closing = rows.length ? rows[rows.length - 1] : null;
		if (!closing || !closing.bold) {
			set_tile(state, "outstanding", "&ndash;", "");
			return;
		}

		// that row fills one side only -- debit when positive, credit when negative
		const balance = (closing.debit || 0) - (closing.credit || 0);
		if (!balance) {
			set_tile(state, "outstanding", currency(0), "");
			return;
		}

		const side = balance > 0 ? "Dr" : "Cr";
		const amount = currency(Math.abs(balance));
		set_tile(state, "outstanding", amount + dc(side), "", side !== natural_side(party_type));
	}

	// format_currency returns the plain string frappe's Currency formatter would
	// build, without the right-aligned div it wraps around it -- that div would
	// push this tile out of line with the others
	function currency(value) {
		if (typeof format_currency === "function") return format_currency(whole(value), null, 0);
		return frappe.format(whole(value), { fieldtype: "Currency" }, { inline: true });
	}

	// the tiles read at a glance, where the paise cost width without adding
	// anything, so they are dropped. truncated rather than rounded, so a tile
	// never reads higher than the figure in the tab below it
	function whole(value) {
		return Math.trunc(value || 0);
	}

	function set_bills_tile(state, rows, party_type) {
		const total_row = rows.find((row) => row.bold);
		const bill_rows = rows.filter((row) => !row.bold);
		if (!bill_rows.length) {
			set_tile(state, "bills", "&ndash;", __("none pending"));
			return;
		}

		// bills sit on the party's own side by construction, so never the red one
		const html = count_and_amount(
			bill_rows.length,
			__("bill"),
			__("bills"),
			(total_row && total_row.outstanding_value) || 0,
			natural_side(party_type)
		);
		set_tile(state, "bills", html, "");
	}

	function set_not_reconciled_tile(state, rows, party_type) {
		const total_row = rows.find((row) => row.bold);
		const payment_rows = rows.filter((row) => !row.bold);
		// the report lists only what is still unallocated, so an empty result means
		// nothing is left to reconcile -- not that the query failed
		if (!payment_rows.length) {
			set_tile(state, "not_reconciled", "&ndash;", __("nothing open"));
			return;
		}

		const html = count_and_amount(
			payment_rows.length,
			__("payment"),
			__("payments"),
			(total_row && total_row.non_reconciled_value) || 0,
			// payments sit opposite the party's own side
			natural_side(party_type) === "Dr" ? "Cr" : "Dr"
		);
		// money left unallocated is worth flagging whatever the party type
		set_tile(state, "not_reconciled", html, "", true);
	}

	// which side this party's own balances belong on: a Customer owes us (debit),
	// we owe a Supplier (credit). the other side is a negative balance.
	function natural_side(party_type) {
		return party_type === "Supplier" ? "Cr" : "Dr";
	}

	// "6 bills | 70,675 Dr" -- the count carries the unit word, so the amount
	// drops its currency symbol rather than crowd two symbols into one tile
	function count_and_amount(count, singular, plural, amount, side) {
		return two_figures(counted(count, singular, plural), format_amount(amount) + dc(side));
	}

	// the two figures a tile can hold, split by a thin rule
	function two_figures(left_html, right_html) {
		return (
			`<span class="logicx-pd-amount">${left_html}</span>` +
			'<span class="logicx-pd-amount-sep">|</span>' +
			`<span class="logicx-pd-amount">${right_html}</span>`
		);
	}

	// "6 bills", "1 day" -- the unit word steps down beside the figure it counts
	function counted(count, singular, plural) {
		const noun = count === 1 ? singular : plural;
		return (
			`${frappe.utils.escape_html(String(count))} ` +
			`<span class="logicx-pd-unit">${frappe.utils.escape_html(noun)}</span>`
		);
	}

	// written as literals so the translation extractor still sees Dr and Cr
	function dc(side) {
		const label = side === "Dr" ? __("Dr") : __("Cr");
		return ` <span class="logicx-pd-dc">${label}</span>`;
	}

	// plain grouped number rather than a currency string: the Dr/Cr suffix already
	// says what it is, and two symbols would not fit the tile
	function format_amount(value) {
		const amount = whole(value);
		if (typeof format_number === "function") return format_number(amount, null, 0);
		return String(amount);
	}

	function set_activity_tiles(state, activity) {
		set_activity_tile(state, "last_invoice", activity);
		set_activity_tile(state, "last_payment", activity);
	}

	// "20 days | 2,500" over the posting date, and the tile itself opens the
	// voucher those figures came from. get_party_activity returns every key for
	// both tiles, flattened under the tile's own name.
	function set_activity_tile(state, key, activity) {
		const days = activity[`${key}_days`];
		if (days === null || days === undefined) {
			set_tile(state, key, "&ndash;", __("none"));
			return;
		}

		const amount = activity[`${key}_amount`];
		const aged = counted(days, __("day"), __("days"));
		// a voucher that nets to nothing still has an amount worth showing; only a
		// missing one leaves the tile with its day count alone
		const value =
			amount === null || amount === undefined ? aged : two_figures(aged, currency(amount));

		set_tile(state, key, value, frappe.datetime.str_to_user(activity[`${key}_date`]));
		link_tile(state, key, activity[`${key}_voucher_type`], activity[`${key}_voucher_no`]);
	}

	// points a tile at the document it describes (see open_voucher). set_tile
	// clears the link first, so a tile never keeps the previous party's voucher.
	function link_tile(state, key, voucher_type, voucher_no) {
		if (!voucher_type || !voucher_no) return;
		state.$el
			.find(`[data-tile="${key}"]`)
			.attr("data-voucher-type", voucher_type)
			.attr("data-voucher-no", voucher_no)
			.attr("title", __("Open {0}", [voucher_no]));
	}

	// is_negative is applied on every call, so a tile left red by the previous party
	// clears itself when the next one loads
	function set_tile(state, key, value_html, caption, is_negative) {
		const $tile = state.$el.find(`[data-tile="${key}"]`);
		$tile.removeClass("is-loading");
		$tile.removeAttr("data-voucher-type").removeAttr("data-voucher-no").removeAttr("title");
		$tile
			.find(".logicx-pd-tile-value")
			.html(value_html)
			.toggleClass("is-negative", !!is_negative);
		$tile.find(".logicx-pd-tile-caption").text(caption || "");
	}

	function setup_open_report_links(state) {
		// delegated from the page wrapper so the handler survives every re-render
		state.$el.on("click", ".logicx-pd-open-report", function (e) {
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

	// the styles live here rather than in a sibling party_dashboard.css because a
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
		.logicx-pd {
			display: flex;
			flex-direction: column;
			gap: var(--margin-md);
			padding-bottom: var(--padding-lg);
		}

		.logicx-pd-card {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
		}

		.logicx-pd-card-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--margin-sm);
			padding: var(--padding-md) var(--padding-lg);
			border-bottom: 1px solid var(--border-color);
		}

		.logicx-pd-card-title {
			font-size: var(--text-md);
			font-weight: 600;
			color: var(--text-color);
		}

		.logicx-pd-card-body {
			padding: var(--padding-md) var(--padding-lg);
		}

		/* the datatable brings its own padding, so its card body has none */
		.logicx-pd-card-body.is-table {
			padding: 0;
		}

		.logicx-pd-filters {
			display: flex;
			flex-wrap: wrap;
			gap: var(--margin-md);
		}

		.logicx-pd-filter {
			flex: 1 1 240px;
			min-width: 200px;
			max-width: 360px;
		}

		/* frappe's control markup ships its own bottom margin; the flex gap above
		   already spaces these, so drop it */
		.logicx-pd-filter .frappe-control {
			margin-bottom: 0;
		}

		.logicx-pd-filter .control-label {
			font-size: 11px;
			font-weight: 600;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--text-muted);
			margin-bottom: var(--margin-xs);
		}

		.logicx-pd-stats {
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			gap: var(--margin-md);
		}

		@media (max-width: 1400px) {
			.logicx-pd-stats {
				grid-template-columns: repeat(3, minmax(0, 1fr));
			}
		}

		@media (max-width: 900px) {
			.logicx-pd-stats {
				grid-template-columns: repeat(2, minmax(0, 1fr));
			}
		}

		@media (max-width: 520px) {
			.logicx-pd-stats {
				grid-template-columns: minmax(0, 1fr);
			}
		}

		.logicx-pd-tile {
			padding: var(--padding-md) var(--padding-lg);
			cursor: pointer;
			transition: border-color 0.12s ease;
		}

		.logicx-pd-tile:hover {
			border-color: var(--gray-400, var(--text-muted));
		}

		.logicx-pd-tile:focus-visible {
			outline: 2px solid var(--primary, var(--text-color));
			outline-offset: 2px;
		}

		.logicx-pd-tile-label {
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

		.logicx-pd-tile-value {
			font-size: 26px;
			line-height: 1.15;
			font-weight: 600;
			color: var(--text-color);
			font-variant-numeric: tabular-nums;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		/* two figures share these tiles, so they step down a size to fit them */
		[data-tile="bills"] .logicx-pd-tile-value,
		[data-tile="not_reconciled"] .logicx-pd-tile-value,
		[data-tile="last_invoice"] .logicx-pd-tile-value,
		[data-tile="last_payment"] .logicx-pd-tile-value {
			font-size: 17px;
			line-height: 1.75;
		}

		.logicx-pd-amount-sep {
			color: var(--text-muted);
			font-weight: 400;
			margin: 0 6px;
		}

		/* the unit word and the Dr/Cr marker step down so the figure leads; they
		   inherit colour rather than dim it, so a red tile stays red throughout */
		.logicx-pd-unit,
		.logicx-pd-dc {
			font-size: 0.7em;
			font-weight: 600;
		}

		/* a ledger balance on the wrong side for the party type, and any amount
		   still waiting to be reconciled */
		.logicx-pd-tile-value.is-negative {
			color: var(--red-500);
		}

		.logicx-pd-tile-caption {
			margin-top: 2px;
			font-size: var(--text-sm);
			color: var(--text-muted);
			min-height: 1.2em;
		}

		/* the posting date reads as a date, not as a sentence that can wrap */
		[data-tile="last_invoice"] .logicx-pd-tile-caption,
		[data-tile="last_payment"] .logicx-pd-tile-caption {
			white-space: nowrap;
			font-variant-numeric: tabular-nums;
		}

		/* skeleton shown while a tile is waiting on its request */
		.logicx-pd-tile.is-loading .logicx-pd-tile-value,
		.logicx-pd-tile.is-loading .logicx-pd-tile-caption {
			color: transparent;
			background-color: var(--skeleton-bg, var(--bg-color));
			border-radius: var(--border-radius-sm);
			animation: logicx-pd-pulse 1.4s ease-in-out infinite;
		}

		.logicx-pd-tile.is-loading .logicx-pd-tile-caption {
			max-width: 60px;
		}

		@keyframes logicx-pd-pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.45; }
		}

		/* tab strip that fronts the two statement cards; it stands in for the
		   per-card title bar the cards used to carry */
		.logicx-pd-tabnav {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--margin-md);
			padding: 0 var(--padding-lg);
			border-bottom: 1px solid var(--border-color);
		}

		.logicx-pd-tabnav-tabs {
			display: flex;
			gap: var(--margin-lg);
			flex-wrap: wrap;
		}

		.logicx-pd-tab {
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
			text-align: center;
			white-space: nowrap;
		}

		.logicx-pd-tab:hover {
			color: var(--text-color);
		}

		.logicx-pd-tab.is-active {
			color: var(--text-color);
			border-bottom-color: var(--primary, var(--text-color));
		}

		.logicx-pd-tabpane.hidden {
			display: none;
		}

		.logicx-pd-open-report {
			font-size: var(--text-sm);
			color: var(--text-muted);
			white-space: nowrap;
		}

		.logicx-pd-open-report:hover {
			color: var(--text-color);
			text-decoration: none;
		}

		/* frappe's desk CSS defines .hidden too; repeated here so the link's
		   visibility never depends on that global staying put */
		.logicx-pd-open-report.hidden {
			display: none;
		}

		/* the report .py files mark their Total / Closing Balance rows with bold: 1 */
		.logicx-pd-bold {
			font-weight: 600;
		}

		/* inline empty / error / loading line inside a table card */
		.logicx-pd-note {
			padding: var(--padding-lg);
			font-size: var(--text-md);
			color: var(--text-muted);
			text-align: center;
		}

		.logicx-pd-note.is-error {
			color: var(--red-500);
		}

		/* frappe-datatable draws its own borders; the card already supplies the
		   outer one, and the rounded bottom corners need to clip the last row */
		.logicx-pd-card-body.is-table .datatable {
			border: none;
			border-bottom-left-radius: var(--border-radius-md);
			border-bottom-right-radius: var(--border-radius-md);
			overflow: hidden;
		}

		/* Party Bill-wise Statement labels a column "Outstanding<br>Value", and
		   Party Payment-wise Non-Reconciled a "Non-Reconciled<br>Value".
		   frappe-datatable truncates header labels with an ellipsis and offers no
		   wrap option, so allow wrapping the same way wrap_column_headers() does
		   in the report JS. */
		.logicx-pd-card-body.is-table .dt-header .dt-row-header,
		.logicx-pd-card-body.is-table .dt-header .dt-row-header .dt-cell--header {
			height: 50px !important;
		}

		.logicx-pd-card-body.is-table .dt-header .dt-cell--header .dt-cell__content {
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
		.logicx-pd-card-body.is-table .dt-scrollable {
			max-height: 33333px !important;
			overflow-y: auto !important;
		}
	`;
})();
