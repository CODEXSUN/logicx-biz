(function () {
	const PAGE_NAME = "apparel-dashboard";
	const STYLE_ID = "logicx-apparel-dashboard-styles";

	// every log tab reads the same doctype, one body column and the time beside
	// it; which body (see TABS) and the api_path it is narrowed to differ
	const LOG_DOCTYPE = "API One Log";
	const LOG_ORDER_BY = "creation desc";
	const LOG_LIMIT = 1000;

	// the api_path the Commands tab's table is narrowed to
	const COMMAND_API_PATH = "apparel-command";

	// the tab strip. a tab with an `api_path` is a log tab: an empty body a
	// datatable of API One Log rows is built into once the tab is on screen,
	// showing the log field named by `content` -- what the device sent for a
	// log, what the endpoint answered for a command. `composer` puts the
	// command box above that table.
	const DASHBOARD_TAB = "dashboard";
	const TABS = [
		{ key: DASHBOARD_TAB, title: __("Dashboard") },
		{ key: "logs", title: __("Logs"), api_path: "apparel-log", content: "request_content" },
		{
			key: "commands",
			title: __("Commands"),
			api_path: COMMAND_API_PATH,
			content: "response_content",
			composer: true,
		},
	];
	const LOG_TABS = TABS.filter((tab) => tab.api_path);

	// held across on_page_load / on_page_show, which frappe calls separately
	let dashboard = null;

	frappe.pages[PAGE_NAME].on_page_load = function (wrapper) {
		dashboard = new ApparelDashboard(wrapper);
	};

	frappe.pages[PAGE_NAME].on_page_show = function () {
		// the log keeps growing while the user is elsewhere on the desk
		if (dashboard) dashboard.reload_active_tab();
	};

	class ApparelDashboard {
		constructor(wrapper) {
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: __("Apparel Dashboard"),
				single_column: true,
			});

			inject_styles();

			this.$el = $('<div class="logicx-ad"></div>').appendTo(this.page.main).html(render_scaffold());

			this.controls = {};
			this.tables = {};
			// bumped per tab per load so a slow response the next load has
			// already superseded can be dropped instead of landing over it
			this.seq = {};
			this.active_tab = TABS[0].key;
			// frappe lazy-loads the datatable bundle; the report views await this
			// same call before constructing one, so the page does too
			this.datatable_ready = ensure_datatable();

			this.setup_composer();
			this.setup_events();
		}

		/* ------------------------------------------------------------ composer */

		setup_composer() {
			const tab = TABS.find((t) => t.composer);
			if (!tab) return;

			this.controls.command = frappe.ui.form.make_control({
				parent: this.$el.find(`[data-tab-pane="${tab.key}"] [data-field="command"]`),
				df: {
					fieldname: "command",
					label: __("Command"),
					fieldtype: "Small Text",
					description: __("Ctrl+Enter to send"),
				},
				render_input: true,
			});

			// the textarea itself; Ctrl+Enter (Cmd+Enter on a Mac) sends without
			// leaving the keyboard, a plain Enter still breaks the line
			this.controls.command.$input.on("keydown", (e) => {
				if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
					e.preventDefault();
					this.send_command();
				}
			});
		}

		command_text() {
			return (this.controls.command.get_value() || "").trim();
		}

		// TODO: sending is not implemented yet. the button and Ctrl+Enter both
		// land here, so this is the one place to wire it up when it is.
		send_command() {
			const command = this.command_text();
			if (!command) return;

			frappe.show_alert({
				message: __("Sending commands is not implemented yet."),
				indicator: "orange",
			});
		}

		/* -------------------------------------------------------------- events */

		setup_events() {
			this.$el.on("click", ".logicx-ad-tab", (e) => {
				e.preventDefault();
				this.activate_tab($(e.currentTarget).attr("data-tab"));
			});

			this.$el.on("click", '[data-action="send"]', (e) => {
				e.preventDefault();
				this.send_command();
			});

			this.$el.on("click", '[data-action="refresh"]', (e) => {
				e.preventDefault();
				this.reload_active_tab();
			});
		}

		activate_tab(key) {
			if (!key || key === this.active_tab) return;
			this.active_tab = key;

			this.$el.find(".logicx-ad-tab").each(function () {
				$(this).toggleClass("is-active", $(this).attr("data-tab") === key);
			});
			this.$el.find(".logicx-ad-tabpane").each(function () {
				$(this).toggleClass("hidden", $(this).attr("data-tab-pane") !== key);
			});

			// load now that the pane is visible -- frappe-datatable sizes its
			// columns wrong inside a hidden pane, so nothing is built ahead of time
			this.load_tab(key);
		}

		reload_active_tab() {
			this.load_tab(this.active_tab);
		}

		/* -------------------------------------------------------------- tables */

		load_tab(key) {
			const tab = LOG_TABS.find((t) => t.key === key);
			if (!tab) return;

			const seq = (this.seq[key] = (this.seq[key] || 0) + 1);
			this.show_note(key, __("Loading..."));

			Promise.all([fetch_log_rows(tab), this.datatable_ready])
				.then(([rows]) => {
					if (seq !== this.seq[key]) return;
					if (!rows.length) {
						this.show_note(key, __("No records"));
						return;
					}
					this.build_table(tab, rows);
				})
				.catch((error) => {
					if (seq !== this.seq[key]) return;
					console.error(error);
					this.show_note(key, __("Could not load these records."), true);
				});
		}

		build_table(tab, rows) {
			const key = tab.key;
			const DataTableClass = frappe.DataTable || window.DataTable;
			if (!DataTableClass) {
				this.show_note(key, __("Could not load these records."), true);
				return;
			}

			const $body = this.$table_body(key);
			this.destroy_table(key);
			$body.empty();

			this.tables[key] = new DataTableClass($body.get(0), {
				columns: log_columns(tab),
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

		destroy_table(key) {
			const table = this.tables[key];
			if (table && typeof table.destroy === "function") table.destroy();
			this.tables[key] = null;
		}

		$table_body(key) {
			return this.$el.find(`[data-tab-pane="${key}"] .logicx-ad-card-body.is-table`);
		}

		show_note(key, text, is_error) {
			this.destroy_table(key);
			const css_class = is_error ? "logicx-ad-note is-error" : "logicx-ad-note";
			this.$table_body(key).html(`<div class="${css_class}">${frappe.utils.escape_html(text)}</div>`);
		}
	}

	/* ==================================================================== data */

	function fetch_log_rows(tab) {
		return frappe.db.get_list(LOG_DOCTYPE, {
			fields: [tab.content, "creation"],
			filters: [["api_path", "=", tab.api_path]],
			order_by: LOG_ORDER_BY,
			limit: LOG_LIMIT,
		});
	}

	/* ================================================================= columns */

	// the body is what the row is for, so it takes the room; the time beside it
	// is a fixed width. newlines in the body are kept (see the
	// .logicx-ad-content rule) so a JSON payload reads as it was sent.
	const CONTENT_LABELS = {
		request_content: __("Request Content"),
		response_content: __("Response Content"),
	};

	function log_columns(tab) {
		return [
			{
				id: tab.content,
				name: CONTENT_LABELS[tab.content] || tab.content,
				editable: false,
				format: (value) => `<div class="logicx-ad-content">${frappe.utils.escape_html(value || "")}</div>`,
			},
			{
				id: "creation",
				name: __("Time"),
				width: 170,
				editable: false,
				align: "left",
				// the desk's own Datetime formatter, so it reads as it does in the list view
				format: (value) => (value ? frappe.format(value, { fieldtype: "Datetime" }) : ""),
			},
		];
	}

	/* ================================================================== markup */

	function render_scaffold() {
		const buttons = TABS.map(
			(tab, i) => `
			<button type="button" class="logicx-ad-tab${i === 0 ? " is-active" : ""}"
				data-tab="${tab.key}">
				${frappe.utils.escape_html(tab.title)}
			</button>`
		).join("");

		// the Dashboard pane is empty for now; every log pane is an empty body a
		// datatable is built into once its tab is on screen, under the command
		// box if the tab carries one
		const panes = TABS.map(
			(tab, i) => `
			<div class="logicx-ad-tabpane${i === 0 ? "" : " hidden"}" data-tab-pane="${tab.key}">
				${tab.api_path
					? `${tab.composer ? render_composer() : ""}
						<div class="logicx-ad-card-body is-table"></div>`
					: `<div class="logicx-ad-card-body logicx-ad-empty"></div>`
				}
			</div>`
		).join("");

		return `
			<div class="logicx-ad-card logicx-ad-tabcard">
				<div class="logicx-ad-tabnav">
					<div class="logicx-ad-tabnav-tabs">${buttons}</div>
					<a href="#" class="logicx-ad-refresh" data-action="refresh">${__("Refresh")}</a>
				</div>
				${panes}
			</div>`;
	}

	function render_composer() {
		return `
			<div class="logicx-ad-composer">
				<div class="logicx-ad-field" data-field="command"></div>
				<button type="button" class="btn btn-primary btn-sm logicx-ad-send" data-action="send">
					${__("Send")}
				</button>
			</div>`;
	}

	function ensure_datatable() {
		if (frappe.DataTable || window.DataTable) return Promise.resolve();
		// frappe.require has taken a callback in some versions and returned a
		// promise in others, so settle on whichever one this build offers --
		// this promise must always resolve or the tables hang on "Loading..."
		return new Promise(function (resolve) {
			try {
				const loading = frappe.require("data_table.bundle.js", resolve);
				if (loading && typeof loading.then === "function") loading.then(resolve, resolve);
			} catch (e) {
				resolve();
			}
		});
	}

	/* ================================================================== styles */

	// injected rather than a sibling .css for the same reason party_dashboard.js
	// does it: a standard Page's .css asset is not reliably served across frappe
	// versions. textContent is re-set on every load so edits take effect
	// without a hard browser reload.
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
		.logicx-ad {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
			padding: var(--padding-sm) var(--padding-md) var(--padding-lg);
		}

		/* the tab strip reads as the page's header rather than as a box on it,
		   so it draws no outline; the table inside keeps its own */
		.logicx-ad-tabcard {
			background-color: transparent;
			border: none;
			border-radius: 0;
			box-shadow: none;
		}

		.logicx-ad-card-body {
			padding: var(--padding-md) var(--padding-lg);
		}

		.logicx-ad-card-body.is-table {
			padding: 0;
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			overflow: hidden;
		}

		.logicx-ad-empty {
			min-height: 120px;
		}

		.logicx-ad-tabnav {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--margin-md);
			padding: 0;
			border-bottom: 1px solid var(--border-color);
		}

		.logicx-ad-tabnav-tabs {
			display: flex;
			gap: var(--margin-lg);
			flex-wrap: wrap;
		}

		.logicx-ad-tab {
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

		.logicx-ad-tab:hover {
			color: var(--text-color);
		}

		.logicx-ad-tab.is-active {
			color: var(--text-color);
			border-bottom-color: var(--primary, var(--text-color));
		}

		/* frappe's desk CSS defines .hidden too; repeated here so a pane's
		   visibility never depends on that global staying put */
		.logicx-ad-tabpane.hidden {
			display: none;
		}

		.logicx-ad-refresh {
			font-size: var(--text-sm);
			color: var(--text-muted);
			white-space: nowrap;
		}

		.logicx-ad-refresh:hover {
			color: var(--text-color);
			text-decoration: none;
		}

		/* the command box and its Send button, between the tab strip and the
		   history beneath. the button sits on the box's bottom edge, under the
		   "Ctrl+Enter to send" hint the control draws for itself. */
		.logicx-ad-composer {
			display: flex;
			align-items: flex-end;
			gap: var(--margin-md);
			padding: var(--padding-md) 0;
		}

		.logicx-ad-field {
			flex: 1 1 auto;
			min-width: 0;
		}

		/* frappe's control markup ships its own bottom margin; the composer's
		   own padding already spaces it from the table, so drop it */
		.logicx-ad-field .frappe-control {
			margin-bottom: 0;
		}

		.logicx-ad-field textarea {
			min-height: 80px;
			font-family: var(--font-stack-mono, monospace);
		}

		.logicx-ad-send {
			flex: 0 0 auto;
			/* line up with the textarea's bottom edge, above the hint under it */
			margin-bottom: 22px;
		}

		/* inline empty / error / loading line inside a table card */
		.logicx-ad-note {
			padding: var(--padding-lg);
			font-size: var(--text-md);
			color: var(--text-muted);
			text-align: center;
		}

		.logicx-ad-note.is-error {
			color: var(--red-500);
		}

		/* a body keeps its line breaks and wraps long ones rather than being
		   cut to one line by the cell */
		.logicx-ad-content {
			white-space: pre-wrap;
			overflow-wrap: anywhere;
			font-family: var(--font-stack-mono, monospace);
			font-size: var(--text-sm);
			line-height: 1.4;
		}

		/* frappe-datatable fixes every body row to one line -- a set height on
		   the row and cell, and overflow: hidden with an ellipsis on the content
		   inside -- and dynamicRowHeight alone does not undo all of it. let the
		   row grow to whatever its tallest cell needs instead; the row is a
		   flex line, so the time cell beside a long body stretches with it and
		   the borders stay in step. !important because datatable sets these
		   inline and in its own stylesheet. the header keeps its one line. */
		.logicx-ad-card-body.is-table .dt-body .dt-row,
		.logicx-ad-card-body.is-table .dt-body .dt-cell {
			height: auto !important;
			min-height: var(--dt-cell-height, 38px);
		}

		.logicx-ad-card-body.is-table .dt-body .dt-cell__content {
			height: auto !important;
			max-height: none !important;
			white-space: pre-wrap !important;
			overflow: visible !important;
			text-overflow: clip;
			overflow-wrap: anywhere;
		}

		/* frappe-datatable draws its own borders; the card already supplies the
		   outer one, and the rounded bottom corners need to clip the last row */
		.logicx-ad-card-body.is-table .datatable {
			border: none;
			border-bottom-left-radius: var(--border-radius-md);
			border-bottom-right-radius: var(--border-radius-md);
			overflow: hidden;
		}

		/* the table scrolls inside its own card instead of stretching the page.
		   max-height rather than height so a short result still shrinks to fit;
		   !important because frappe-datatable sets its own height inline. */
		.logicx-ad-card-body.is-table .dt-scrollable {
			max-height: 70vh !important;
			overflow-y: auto !important;
		}
	`;
})();
