(function () {
	const PAGE_NAME = "party-dashboard";
	const PARTY_TYPES = ["Customer", "Supplier"];
	const PARTY_DEBOUNCE_MS = 300;
	const STYLE_ID = "logicx-party-dashboard-styles";
	const DASH = "&ndash;";

	const BILL_WISE_STATEMENT_REPORT = "Party Bill-wise Statement";
	const PAYMENT_WISE_NON_RECONCILED_REPORT = "Party Payment-wise Non-Reconciled";
	const LEDGER_STATEMENT_REPORT = "Party Statement";
	const OUTSTANDING_DETAILED_REPORT = "Party Outstanding Detailed";
	const ACTIVITY_METHOD = "logicx_biz.logicx_erp.party_dashboard.get_party_activity";

	// how many tiles a full row holds. drives both the grid and the offset a
	// short row is centred by, so the two cannot drift apart.
	const TILE_COLUMNS = 4;

	// every tile names the `source` it is read off, so it can never disagree with
	// the statement that source also fills, and the `tab` a click on it opens.
	// the ledger-total and activity tiles have no statement of their own, so they
	// fall back to the ledger.
	//
	// grouped by the row it is shown in on the Dashboard tab: the ledger reads
	// left to right along the top -- what it opened at, what moved, where it
	// stands -- then what is still open beneath it, and the last voucher on
	// either side last, centred under the two full rows above.
	const TILE_ROWS = [
		[
			{ key: "opening", label: __("Opening"), source: "ledger_totals", tab: "ledger_statement" },
			{ key: "debits", label: __("Debits"), source: "ledger_totals", tab: "ledger_statement" },
			{ key: "credits", label: __("Credits"), source: "ledger_totals", tab: "ledger_statement" },
			{
				key: "outstanding",
				label: __("Balance"),
				source: "ledger_statement",
				tab: "ledger_statement",
				// the figure the three beside it add up to, so it is the one tile
				// that reads at headline size
				lead: true,
			},
		],
		[
			{
				key: "bills",
				label: __("UnReconciled Bills"),
				source: "bill_wise_statement",
				tab: "bill_wise_statement",
			},
			{
				key: "not_reconciled",
				label: __("UnReconciled Payments"),
				source: "payment_wise_non_reconciled",
				tab: "payment_wise_non_reconciled",
			},
			// `overdue_days` is the ageing cut-off the tile counts by, and is
			// exclusive: a bill exactly that old is not yet overdue by it
			{
				key: "overdue_21",
				label: __("21 Days Overdue Bills"),
				source: "bill_wise_statement",
				tab: "bill_wise_statement",
				overdue_days: 21,
			},
			{
				key: "overdue_30",
				label: __("30 Days Overdue Bills"),
				source: "bill_wise_statement",
				tab: "bill_wise_statement",
				overdue_days: 30,
			},
		],
		[
			{ key: "last_invoice", label: __("Last Invoice"), source: "activity", tab: "ledger_statement" },
			{ key: "last_payment", label: __("Last Payment"), source: "activity", tab: "ledger_statement" },
		],
	];

	// the same tiles as one list, for everything that treats them as a set
	const TILES = TILE_ROWS.flat();
	const OVERDUE_TILES = TILES.filter((tile) => tile.overdue_days);

	// the Age column of a bill/payment row reads red past this many days, again
	// exclusive -- the first overdue tile's cut-off, so the table agrees with it
	const AGE_ALERT_DAYS = OVERDUE_TILES[0].overdue_days;

	// one request each, fired together whenever a party is picked. a source with
	// `card: true` also fills the tab named after it; `ledger_totals` and
	// `activity` only feed tiles. `derive` turns the response into the tiles it
	// backs, and is pure -- it reads that response and nothing else.
	const SOURCES = [
		{
			key: "bill_wise_statement",
			title: __("UnReconciled Bills"),
			report: BILL_WISE_STATEMENT_REPORT,
			card: true,
			derive: bill_tiles,
		},
		{
			// the payments side of the same reconciliation the bill-wise tab
			// shows the bills side of
			key: "payment_wise_non_reconciled",
			title: __("UnReconciled Payments"),
			report: PAYMENT_WISE_NON_RECONCILED_REPORT,
			card: true,
			derive: payment_tiles,
		},
		{
			key: "ledger_statement",
			title: __("Statement"),
			report: LEDGER_STATEMENT_REPORT,
			card: true,
			derive: ledger_tiles,
		},
		{
			// the ledger totals behind the first three tiles. this report has no
			// tab of its own -- it is the party-wise list the dashboard drills
			// down from, narrowed here to the one party on screen.
			key: "ledger_totals",
			report: OUTSTANDING_DETAILED_REPORT,
			derive: ledger_total_tiles,
		},
		{
			key: "activity",
			fetch: fetch_activity,
			derive: activity_tiles,
		},
	];

	const CARDS = SOURCES.filter((source) => source.card);

	// the tab strip: the tiles lead in a Dashboard tab of their own, and each
	// statement card follows in the tab named after it. the Dashboard tab has no
	// report behind it, which is what tells the rest of the page it is not a card.
	const DASHBOARD_TAB = "dashboard";
	const TABS = [{ key: DASHBOARD_TAB, title: __("Dashboard") }].concat(CARDS);

	// held across on_page_load / on_page_show, which frappe calls separately
	let dashboard = null;

	frappe.pages[PAGE_NAME].on_page_load = function (wrapper) {
		dashboard = new PartyDashboard(wrapper);
	};

	frappe.pages[PAGE_NAME].on_page_show = function () {
		if (dashboard) dashboard.apply_prefill();
	};

	class PartyDashboard {
		constructor(wrapper) {
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: __("Party Dashboard"),
				single_column: true,
			});

			inject_styles();

			this.$el = $('<div class="logicx-pd"></div>').appendTo(this.page.main).html(render_scaffold());

			this.controls = {};
			this.tables = {};
			this.party_type = PARTY_TYPES[0];
			this.party = "";
			// bumped per load so a slow response for a party the user has already
			// moved on from can be dropped instead of landing under the new name
			this.seq = 0;
			// the last result handed to each statement card, kept so switching
			// tabs can build the datatable while its pane is actually visible --
			// frappe-datatable sizes its columns wrong inside a hidden pane
			this.results = {};
			this.active_tab = TABS[0].key;
			this.url_params_read = false;
			// frappe lazy-loads the datatable bundle; the report views await this
			// same call before constructing one, so the page does too
			this.datatable_ready = ensure_datatable();

			this.setup_filters();
			this.setup_events();
			this.load(this.party_type, "");
		}

		/* ------------------------------------------------------------- filters */

		setup_filters() {
			this.controls.party_type = frappe.ui.form.make_control({
				parent: this.$el.find('[data-filter="party_type"]'),
				df: {
					fieldname: "party_type",
					label: __("Party Type"),
					fieldtype: "Select",
					options: PARTY_TYPES.join("\n"),
					change: () => this.on_party_type_change(),
				},
				render_input: true,
			});
			this.controls.party_type.set_value(PARTY_TYPES[0]);

			// a standalone control has no sibling field to hang a Dynamic Link
			// off, so this is a plain Link repointed whenever the party type
			// changes (see point_party_at below)
			this.controls.party = frappe.ui.form.make_control({
				parent: this.$el.find('[data-filter="party"]'),
				df: {
					fieldname: "party",
					label: __("Party"),
					// the label is off-screen, so the field names itself here
					placeholder: __("Party"),
					fieldtype: "Link",
					options: PARTY_TYPES[0],
					change: frappe.utils.debounce(() => this.reload(), PARTY_DEBOUNCE_MS),
				},
				render_input: true,
			});
		}

		on_party_type_change() {
			const party_type = this.selected_party_type();
			// the selected party belongs to the previous party type, so it goes
			// with it
			this.point_party_at(party_type, { clear: true });
			this.load(party_type, "");
		}

		point_party_at(party_type, { clear } = {}) {
			this.controls.party.df.options = party_type;
			if (clear) this.controls.party.set_value("");
			this.controls.party.refresh();
		}

		selected_party_type() {
			const value = this.controls.party_type.get_value();
			return PARTY_TYPES.includes(value) ? value : PARTY_TYPES[0];
		}

		reload() {
			this.load(this.selected_party_type(), (this.controls.party.get_value() || "").trim());
		}

		apply_prefill() {
			const from_route = frappe.route_options || {};
			frappe.route_options = null;

			// URL params are read once, on the first show -- the desk keeps the
			// query string around as you navigate away and back, and re-applying
			// it would silently undo whatever the user picked in the meantime
			const from_url = this.url_params_read ? {} : frappe.utils.get_query_params() || {};
			this.url_params_read = true;

			const party_type = from_route.party_type || from_url.party_type;
			const party = from_route.party || from_url.party;
			if (!party_type && !party) return;

			// party_type first: it repoints the party link at the right doctype
			if (party_type && PARTY_TYPES.includes(party_type)) {
				this.controls.party_type.set_value(party_type);
				this.point_party_at(party_type);
			}
			if (party) this.controls.party.set_value(party);

			this.reload();
		}

		/* ------------------------------------------------------------- loading */

		load(party_type, party) {
			const seq = ++this.seq;
			this.party_type = party_type;
			this.party = party;
			this.results = {};
			this.update_open_report_link();

			if (!party) {
				this.set_tiles(blank(TILES));
				CARDS.forEach((card) => this.show_note(card.key, __("Select a party to begin.")));
				return;
			}

			TILES.forEach((tile) => this.$tile(tile.key).addClass("is-loading"));
			CARDS.forEach((card) => this.show_note(card.key, __("Loading...")));

			const ctx = { party_type: party_type, party: party };
			SOURCES.forEach((source) => {
				fetch_source(source, ctx)
					.then((data) => {
						if (seq !== this.seq) return;
						if (source.card) this.set_card(source.key, data);
						this.set_tiles(source.derive(data, ctx));
					})
					.catch(() => {
						if (seq !== this.seq) return;
						if (source.card) {
							this.show_note(source.key, __("Could not load this statement."), true);
						}
						this.set_tiles(blank(tiles_of(source.key)));
					});
			});
		}

		/* --------------------------------------------------------------- tiles */

		$tile(key) {
			return this.$el.find(`[data-tile="${key}"]`);
		}

		set_tiles(views) {
			Object.keys(views).forEach((key) => this.set_tile(key, views[key]));
		}

		// every part of a tile is written on every call, so nothing of the
		// previous party's -- a red value, a voucher link -- survives into the
		// next one. an empty view renders as a dash.
		set_tile(key, view) {
			const voucher = view.voucher && view.voucher.type && view.voucher.no ? view.voucher : null;
			const $tile = this.$tile(key);

			$tile
				.removeClass("is-loading")
				.attr("data-voucher-type", voucher && voucher.type)
				.attr("data-voucher-no", voucher && voucher.no)
				.attr("title", voucher ? __("Open {0}", [voucher.no]) : null);

			$tile
				.find(".logicx-pd-tile-value")
				.html(view.value || DASH)
				.toggleClass("is-negative", !!view.negative);
			$tile.find(".logicx-pd-tile-caption").text(view.caption || "");
		}

		/* ---------------------------------------------------------------- tabs */

		setup_events() {
			// delegated from the page wrapper so the handlers survive re-renders
			this.$el.on("click", ".logicx-pd-tab, .logicx-pd-tile", (e) => {
				this.on_press($(e.currentTarget));
			});

			// the tabs are real buttons, but the tiles are divs, so Enter and
			// Space have to be wired up by hand to match the role they advertise
			this.$el.on("keydown", ".logicx-pd-tile", (e) => {
				if (e.key !== "Enter" && e.key !== " ") return;
				e.preventDefault();
				this.on_press($(e.currentTarget));
			});

			this.$el.on("click", ".logicx-pd-open-report", (e) => {
				e.preventDefault();
				if (!this.party) return;
				open_report_in_new_tab(
					$(e.currentTarget).attr("data-report-name"),
					this.party_type,
					this.party
				);
			});
		}

		// an activity tile stands for one document, so it opens that document
		// instead of the tab it would otherwise switch to
		on_press($target) {
			const voucher_type = $target.attr("data-voucher-type");
			const voucher_no = $target.attr("data-voucher-no");
			if (voucher_type && voucher_no) {
				frappe.set_route("Form", voucher_type, voucher_no);
				return;
			}
			this.activate_tab($target.attr("data-tab"));
		}

		activate_tab(key) {
			if (!key || key === this.active_tab) return;
			this.active_tab = key;

			this.$el.find(".logicx-pd-tab").each(function () {
				$(this).toggleClass("is-active", $(this).attr("data-tab") === key);
			});
			this.$el.find(".logicx-pd-tabpane").each(function () {
				$(this).toggleClass("hidden", $(this).attr("data-report") !== key);
			});

			this.update_open_report_link();

			// build the datatable now that its pane is visible (see this.results)
			this.render_table(key);
		}

		// the shared "Open full report" link follows the active tab. the Dashboard
		// tab has no single report behind it, so the link goes away there, as it
		// does before a party is picked.
		update_open_report_link() {
			const card = CARDS.find((c) => c.key === this.active_tab);
			const $link = this.$el.find(".logicx-pd-open-report");
			if (card) $link.attr("data-report-name", card.report);
			$link.toggleClass("hidden", !card || !this.party);
		}

		/* -------------------------------------------------------------- tables */

		// hand a result to a statement card: remember it, and build the table now
		// only if that card's tab is the one on screen
		set_card(key, data) {
			this.results[key] = { columns: data.columns, rows: data.rows, seq: this.seq };
			if (key === this.active_tab) this.render_table(key);
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
				// the bundle may have loaded while the user moved on to another party
				if (seq !== this.seq) return;
				this.build_table(key, result);
			});
		}

		build_table(key, result) {
			const DataTableClass = frappe.DataTable || window.DataTable;
			if (!DataTableClass) {
				this.show_note(key, __("Could not load this statement."), true);
				return;
			}

			const $body = this.$card_body(key);
			this.destroy_table(key);
			$body.empty();

			this.tables[key] = new DataTableClass($body.get(0), {
				columns: result.columns.map(to_datatable_column),
				data: result.rows,
				layout: "fluid",
				inlineFilters: true,
				serialNoColumn: false,
				checkboxColumn: false,
				disableReorderColumn: true,
				dynamicRowHeight: true,
				noDataMessage: __("No records"),
			});
		}

		destroy_table(key) {
			const table = this.tables[key];
			if (table && typeof table.destroy === "function") table.destroy();
			this.tables[key] = null;
		}

		$card_body(key) {
			return this.$el.find(`[data-report="${key}"] .logicx-pd-card-body`);
		}

		show_note(key, text, is_error) {
			this.destroy_table(key);
			const css_class = is_error ? "logicx-pd-note is-error" : "logicx-pd-note";
			this.$card_body(key).html(`<div class="${css_class}">${frappe.utils.escape_html(text)}</div>`);
		}
	}

	/* ==================================================================== markup */

	function render_scaffold() {
		return `
			<div class="logicx-pd-card logicx-pd-filtercard">
				<div class="logicx-pd-card-body">
					<div class="logicx-pd-filters">
						<div class="logicx-pd-filter" data-filter="party_type"></div>
						<div class="logicx-pd-filter" data-filter="party"></div>
					</div>
				</div>
			</div>
			${render_tabcard()}
		`;
	}

	// one "Open full report" link lives in the tab nav and is repointed at the
	// active tab's report (see update_open_report_link); the click handler reads
	// data-report-name at click time
	function render_tabcard() {
		const buttons = TABS.map(
			(tab, i) => `
			<button type="button" class="logicx-pd-tab${i === 0 ? " is-active" : ""}"
				data-tab="${tab.key}">
				${escape_lines(tab.title)}
			</button>`
		).join("");

		// the Dashboard pane holds the tiles; every other pane is an empty body a
		// datatable is built into once its tab is on screen
		const panes = TABS.map(
			(tab, i) => `
			<div class="logicx-pd-tabpane${i === 0 ? "" : " hidden"}" data-report="${tab.key}">
				${
					tab.key === DASHBOARD_TAB
						? `<div class="logicx-pd-card-body logicx-pd-tiles">${render_tile_rows()}</div>`
						: `<div class="logicx-pd-card-body is-table"></div>`
				}
			</div>`
		).join("");

		return `
			<div class="logicx-pd-card logicx-pd-tabcard">
				<div class="logicx-pd-tabnav">
					<div class="logicx-pd-tabnav-tabs">${buttons}</div>
					<a href="#" class="logicx-pd-open-report hidden"
						data-report-name="${frappe.utils.escape_html(CARDS[0].report)}">
						${__("Open full report")} &#8599;
					</a>
				</div>
				${panes}
			</div>`;
	}

	// a grid of its own per row, so a row that does not fill its columns can be
	// centred under the ones that do without disturbing them
	function render_tile_rows() {
		return TILE_ROWS.map((row) => {
			// the column this row's first tile starts at: the first for a row
			// that fills the grid, further in for a short one, which leaves the
			// same empty column at either end of it
			const offset = Math.floor((TILE_COLUMNS - row.length) / 2) + 1;
			const attrs =
				offset > 1
					? `class="logicx-pd-stats is-short-row" style="--pd-row-offset: ${offset}"`
					: `class="logicx-pd-stats"`;

			return `
			<div ${attrs}>
				${row.map(render_tile).join("")}
			</div>`;
		}).join("");
	}

	function render_tile(tile) {
		return `
			<div class="logicx-pd-card logicx-pd-tile" data-tile="${tile.key}"
				data-tab="${tile.tab}" role="button" tabindex="0">
				<div class="logicx-pd-tile-label">${frappe.utils.escape_html(tile.label)}</div>
				<div class="logicx-pd-tile-value${tile.lead ? " is-lead" : ""}">${DASH}</div>
				<div class="logicx-pd-tile-caption"></div>
			</div>`;
	}

	// a tab title may carry a line break; escape_html would print a literal
	// "<br>", so escape each line and join them with a real one
	function escape_lines(text) {
		return String(text).split("\n").map(frappe.utils.escape_html).join("<br>");
	}

	/* ====================================================================== data */

	function fetch_source(source, ctx) {
		return source.report ? run_report(source.report, ctx) : source.fetch(ctx);
	}

	function run_report(report_name, ctx) {
		return frappe
			.call({
				method: "frappe.desk.query_report.run",
				type: "GET",
				args: {
					report_name: report_name,
					filters: { party_type: ctx.party_type, party: ctx.party },
					ignore_prepared_report: 1,
					are_default_filters: false,
				},
			})
			.then((r) => {
				const message = (r && r.message) || {};
				const columns = message.columns || [];
				return { columns: columns, rows: to_row_objects(columns, message.result || []) };
			});
	}

	function fetch_activity(ctx) {
		return frappe
			.call({ method: ACTIVITY_METHOD, args: { party_type: ctx.party_type, party: ctx.party } })
			.then((r) => (r && r.message) || {});
	}

	// script reports here return dicts, but query_report.run can hand back plain
	// arrays too, so normalise to one shape the derivations can rely on
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

	/* =============================================================== derivations */

	// the report .py files mark their Total / Closing Balance rows with bold: 1
	const is_total = (row) => !!row.bold;
	const is_detail = (row) => !row.bold;

	function tiles_of(source_key) {
		return TILES.filter((tile) => tile.source === source_key);
	}

	// what a tile with nothing behind it renders as: a dash and no caption
	function blank(tiles) {
		return tiles.reduce((views, tile) => {
			views[tile.key] = {};
			return views;
		}, {});
	}

	// the bill-wise result fills three tiles: what is still open, and how much of
	// it has aged past each cut-off. the report ages every bill from its own
	// posting date, so `age` is taken as given rather than recomputed here.
	function bill_tiles({ rows }, ctx) {
		const total = rows.find(is_total);
		const bills = rows.filter(is_detail);

		const views = {
			bills: bills.length
				? {
						// bills sit on the party's own side by construction, so
						// never the red one
						value: count_and_amount(
							bills.length,
							__("bill"),
							__("bills"),
							total && total.outstanding_value,
							own_side(ctx.party_type)
						),
				  }
				: { caption: __("none pending") },
		};

		OVERDUE_TILES.forEach((tile) => {
			const overdue = bills.filter((row) => (row.age || 0) > tile.overdue_days);
			views[tile.key] = overdue.length
				? {
						value: currency(sum(overdue, "outstanding_value")),
						// the caption goes through .text(), so it is plain rather
						// than the marked-up figure `counted` builds for a value
						caption: `${overdue.length} ${overdue.length === 1 ? __("bill") : __("bills")}`,
						// money this old is worth flagging whatever the party type
						negative: true,
				  }
				: { caption: __("none overdue") };
		});

		return views;
	}

	function payment_tiles({ rows }, ctx) {
		const total = rows.find(is_total);
		const payments = rows.filter(is_detail);

		// the report lists only what is still unallocated, so an empty result
		// means nothing is left to reconcile -- not that the query failed
		if (!payments.length) return { not_reconciled: { caption: __("nothing open") } };

		return {
			not_reconciled: {
				value: count_and_amount(
					payments.length,
					__("payment"),
					__("payments"),
					total && total.non_reconciled_value,
					// payments sit opposite the party's own side
					other_side(ctx.party_type)
				),
				// money left unallocated is worth flagging whatever the party type
				negative: true,
			},
		};
	}

	// the ledger's own closing balance rather than the bill-wise total, so
	// advances and anything else that never sat against a bill are counted
	function ledger_tiles({ rows }, ctx) {
		// party_statement.py appends Total and then Closing Balance, both marked
		// bold, so the balance is the last row rather than the first bold one
		const closing = rows[rows.length - 1];
		if (!closing || !closing.bold) return { outstanding: {} };

		// that row fills one side only -- debit when positive, credit when negative
		return { outstanding: signed((closing.debit || 0) - (closing.credit || 0), ctx.party_type) };
	}

	// Opening, Debits and Credits are taken from Party Outstanding Detailed rather
	// than re-totalled here, so the tiles and that report cannot drift apart.
	// Opening is the net of the entries flagged as opening, Debits and Credits the
	// gross movement since -- Balance beside them is where the three meet.
	function ledger_total_tiles({ rows }, ctx) {
		// the report is filtered down to this one party, so its row is the first;
		// a party whose four figures are all zero is left out of it entirely, and
		// the tiles then read zero rather than a dash
		const totals = rows[0] || {};
		return {
			opening: signed(totals.opening, ctx.party_type),
			// debits and credits sit on a fixed side each, so neither carries a marker
			debits: { value: currency(totals.debits) },
			credits: { value: currency(totals.credits) },
		};
	}

	// get_party_activity returns every key for both tiles, flattened under the
	// tile's own name
	function activity_tiles(activity) {
		return tiles_of("activity").reduce((views, tile) => {
			views[tile.key] = activity_tile(tile.key, activity);
			return views;
		}, {});
	}

	// "20 days | 2,500" over the posting date, and the tile itself opens the
	// voucher those figures came from
	function activity_tile(key, activity) {
		const days = activity[`${key}_days`];
		if (days === null || days === undefined) return { caption: __("none") };

		const amount = activity[`${key}_amount`];
		const aged = counted(days, __("day"), __("days"));
		return {
			// a voucher that nets to nothing still has an amount worth showing;
			// only a missing one leaves the tile with its day count alone
			value: amount === null || amount === undefined ? aged : pair(aged, currency(amount)),
			caption: frappe.datetime.str_to_user(activity[`${key}_date`]),
			voucher: { type: activity[`${key}_voucher_type`], no: activity[`${key}_voucher_no`] },
		};
	}

	// Opening and Balance are net figures, so they name the side they landed on
	// the way the report does; the side that is not the party's own is the one
	// worth flagging
	function signed(value, party_type) {
		const amount = value || 0;
		if (!amount) return { value: currency(0) };

		const side = amount > 0 ? "Dr" : "Cr";
		return {
			value: currency(Math.abs(amount)) + dc(side),
			negative: side !== own_side(party_type),
		};
	}

	// which side this party's own balances belong on: a Customer owes us (debit),
	// we owe a Supplier (credit). the other side is a negative balance.
	function own_side(party_type) {
		return party_type === "Supplier" ? "Cr" : "Dr";
	}

	function other_side(party_type) {
		return own_side(party_type) === "Dr" ? "Cr" : "Dr";
	}

	function sum(rows, fieldname) {
		return rows.reduce((total, row) => total + (row[fieldname] || 0), 0);
	}

	/* ================================================================ formatting */

	// "6 bills | 70,675 Dr" -- the count carries the unit word, so the amount
	// drops its currency symbol rather than crowd two symbols into one tile
	function count_and_amount(count, singular, plural, amount, side) {
		return pair(counted(count, singular, plural), plain_amount(amount) + dc(side));
	}

	// the two figures a tile can hold, split by a thin rule
	function pair(left_html, right_html) {
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

	// format_currency returns the plain string frappe's Currency formatter would
	// build, without the right-aligned div it wraps around it -- that div would
	// push this tile out of line with the others
	function currency(value) {
		if (typeof format_currency === "function") return format_currency(whole(value), null, 0);
		return frappe.format(whole(value), { fieldtype: "Currency" }, { inline: true });
	}

	// plain grouped number rather than a currency string: the Dr/Cr suffix already
	// says what it is, and two symbols would not fit the tile
	function plain_amount(value) {
		if (typeof format_number === "function") return format_number(whole(value), null, 0);
		return String(whole(value));
	}

	// the tiles read at a glance, where the paise cost width without adding
	// anything, so they are dropped. truncated rather than rounded, so a tile
	// never reads higher than the figure in the tab below it.
	function whole(value) {
		return Math.trunc(value || 0);
	}

	/* ==================================================================== tables */

	const RIGHT_ALIGNED = ["Currency", "Float", "Int", "Percent"];

	function to_datatable_column(col) {
		return {
			id: col.fieldname,
			name: col.label,
			width: col.width || 120,
			align: RIGHT_ALIGNED.includes(col.fieldtype) ? "right" : "left",
			editable: false,
			focusable: false,
			dropdown: true, // sortable
			sortable: true, // sortable
			format: (value, row, column, data) => format_cell(value, col, data),
		};
	}

	function format_cell(value, col, data) {
		let html = frappe.format(value, col, { always_show_decimals: true }, data);
		html = open_links_in_new_tab(html);
		if (data && data.bold) {
			html = `<span class="logicx-pd-bold">${html}</span>`;
		}
		// the two statements carrying an Age column flag a stale row in red, on
		// the same cut-off the "21 Days Overdue" tile counts by and the report
		// pages colour by, so the card agrees with both
		if (col.fieldname === "age" && (value || 0) > AGE_ALERT_DAYS) {
			html = `<span class="logicx-pd-age-alert">${html}</span>`;
		}
		return html;
	}

	// same convention as commit 0b1967f: party links open in their own tab rather
	// than replacing the page you are working from
	function open_links_in_new_tab(html) {
		if (typeof html !== "string" || html.indexOf("<a ") === -1) return html;
		return html.replace(/<a\s/g, '<a target="_blank" rel="noopener" ');
	}

	function ensure_datatable() {
		if (frappe.DataTable || window.DataTable) return Promise.resolve();
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

	// open `report_name` in a new browser tab with the current party prefilled.
	// frappe.route_options can't survive window.open (a fresh document), so the
	// filters ride along as URL query params instead -- party_type before party,
	// the order the target report's party_type on_change depends on
	function open_report_in_new_tab(report_name, party_type, party) {
		const params = $.param({ party_type: party_type, party: party });
		window.open("/app/query-report/" + encodeURIComponent(report_name) + "?" + params, "_blank");
	}

	/* ==================================================================== styles */

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
		/* nothing inside draws a card outline along the page edge any more, so the
		   page itself holds the content off it -- a little on the top and sides,
		   more underneath so the last row of a statement is not flush with the
		   bottom of the window */
		.logicx-pd {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
			padding: var(--padding-sm) var(--padding-md) var(--padding-lg);
		}

		.logicx-pd-card {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
		}

		/* the filter row and the tab strip below it read as one header for the
		   page rather than as two boxes stacked on it, so both drop the card
		   outline. the tiles and the datatables inside keep theirs. */
		.logicx-pd-filtercard,
		.logicx-pd-tabcard {
			background-color: transparent;
			border: none;
			border-radius: 0;
			box-shadow: none;
		}

		.logicx-pd-card-body {
			padding: var(--padding-md) var(--padding-lg);
		}

		/* with no outline of its own the filter row needs no side inset, just a
		   little clearance from the page header above it and from the tab strip
		   below */
		.logicx-pd-filtercard .logicx-pd-card-body {
			padding: var(--padding-md) 0 var(--padding-xs);
		}

		/* the datatable brings its own padding, so its card body has none. the tab
		   card above it no longer draws an outline, so the body carries the one
		   the statement is read inside, and clips the table to its corners. */
		.logicx-pd-card-body.is-table {
			padding: 0;
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			overflow: hidden;
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

		/* the party type is a two-option select, so it needs half the room the
		   party name beside it does -- every width above, halved */
		.logicx-pd-filter[data-filter="party_type"] {
			flex: 1 1 120px;
			min-width: 100px;
			max-width: 180px;
		}

		/* frappe's control markup ships its own bottom margin; the flex gap above
		   already spaces these, so drop it */
		.logicx-pd-filter .frappe-control {
			margin-bottom: 0;
		}

		/* the two filters are the only fields on the page and read plainly from the
		   values in them, so their labels are dropped from the layout. they stay
		   in the markup, off-screen, so each input keeps an accessible name. */
		.logicx-pd-filter .control-label {
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

		/* the tiles live inside the Dashboard tab, so the spacing between the tile
		   rows -- once the page's own gap -- comes from the pane. the block is
		   capped and centred rather than held off the edges by a fixed inset, so a
		   wide page leaves the room either side without a narrow one paying for
		   it; the padding is only the gutter it keeps once the cap stops biting.
		   each tile drops the shadow it no longer needs sitting on a card rather
		   than on the page behind one. */
		.logicx-pd-tiles {
			display: flex;
			flex-direction: column;
			gap: var(--margin-md);
			width: 100%;
			max-width: 1040px;
			margin: 0 auto;
			padding-left: var(--padding-md);
			padding-right: var(--padding-md);
		}

		.logicx-pd-tiles .logicx-pd-tile {
			box-shadow: none;
		}

		/* as many across as a full row carries -- the width the currency figures
		   need. TILE_COLUMNS is interpolated in, so the grid and the offset a short
		   row is centred by are decided in one place. */
		.logicx-pd-stats {
			display: grid;
			grid-template-columns: repeat(${TILE_COLUMNS}, minmax(0, 1fr));
			gap: var(--margin-md);
		}

		/* a row holding fewer tiles than there are columns is centred under the
		   full ones by starting its first tile --pd-row-offset columns in, which
		   leaves an empty column at either end. only while the grid is at full
		   width -- below that the rows step down and all of them read from the
		   left. */
		@media (min-width: 1101px) {
			.logicx-pd-stats.is-short-row > .logicx-pd-tile:first-child {
				grid-column: var(--pd-row-offset);
			}
		}

		@media (max-width: 1100px) {
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

		/* two figures share most of these tiles, and the rest are read across the
		   row beside them, so they all hold the one size; the tile marked "lead"
		   in TILE_ROWS is the single headline figure and steps up */
		.logicx-pd-tile-value {
			font-size: 17px;
			line-height: 1.75;
			font-weight: 600;
			color: var(--text-color);
			font-variant-numeric: tabular-nums;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.logicx-pd-tile-value.is-lead {
			font-size: 26px;
			line-height: 1.15;
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

		/* tab strip that fronts the tiles and the statement cards; it stands in for
		   the per-card title bar the cards used to carry */
		.logicx-pd-tabnav {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--margin-md);
			padding: 0;
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

		.logicx-pd-age-alert {
			color: var(--red-500);
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
