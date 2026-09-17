(function () {
	const PAGE_NAME = "apparel-dashboard";
	const STYLE_ID = "logicx-apparel-dashboard-styles";

	// every log tab reads the same doctype, one body column and the time beside
	// it; which body (see TABS) and the api_path it is narrowed to differ
	const LOG_DOCTYPE = "API One Log";
	const LOG_ORDER_BY = "creation desc";
	const LOG_LIMIT = 1000;
	// how a card's header shows when it was logged: the user's own date
	// format, then a 12-hour clock (moment tokens; "A" is AM/PM)
	const LOG_TIME_FORMAT = "hh:mm A";

	// the api_path the Commands tab's log is narrowed to
	const COMMAND_API_PATH = "apparel-command";

	// the tab strip. a tab with an `api_path` is a log tab: an empty body a
	// card per API One Log row is rendered into once the tab is on screen,
	// showing the log field named by `content` -- what the device sent for a
	// log, what the endpoint answered for a command. `composer` puts the
	// command box above those cards.
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
			// bumped per tab per load so a slow response the next load has
			// already superseded can be dropped instead of landing over it
			this.seq = {};
			this.active_tab = TABS[0].key;

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

			// loaded on first sight rather than ahead of time, so a tab the user
			// never opens never fetches its thousand rows
			this.load_tab(key);
		}

		reload_active_tab() {
			this.load_tab(this.active_tab);
		}

		/* ---------------------------------------------------------------- logs */

		load_tab(key) {
			const tab = LOG_TABS.find((t) => t.key === key);
			if (!tab) return;

			const seq = (this.seq[key] = (this.seq[key] || 0) + 1);
			this.show_note(key, __("Loading..."));

			fetch_log_rows(tab)
				.then((rows) => {
					if (seq !== this.seq[key]) return;
					if (!rows.length) {
						this.show_note(key, __("No records"));
						return;
					}
					this.render_log(tab, rows);
				})
				.catch((error) => {
					if (seq !== this.seq[key]) return;
					console.error(error);
					this.show_note(key, __("Could not load these records."), true);
				});
		}

		// one card per row, newest first as fetched. the whole list is built as
		// a string and set at once; a thousand appends would reflow a thousand
		// times.
		render_log(tab, rows) {
			const cards = rows.map((row) => render_log_card(row[tab.content], row.creation)).join("");
			this.$log_body(tab.key).html(`<div class="logicx-ad-log">${cards}</div>`);
		}

		$log_body(key) {
			return this.$el.find(`[data-tab-pane="${key}"] .logicx-ad-card-body.is-log`);
		}

		show_note(key, text, is_error) {
			const css_class = is_error ? "logicx-ad-note is-error" : "logicx-ad-note";
			this.$log_body(key).html(`<div class="${css_class}">${frappe.utils.escape_html(text)}</div>`);
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

	/* ================================================================== markup */

	function render_scaffold() {
		const buttons = TABS.map(
			(tab, i) => `
			<button type="button" class="logicx-ad-tab${i === 0 ? " is-active" : ""}"
				data-tab="${tab.key}">
				${frappe.utils.escape_html(tab.title)}
			</button>`
		).join("");

		// the Dashboard pane is empty for now; every log pane is an empty body
		// the cards are rendered into once its tab is on screen, under the
		// command box if the tab carries one
		const panes = TABS.map(
			(tab, i) => `
			<div class="logicx-ad-tabpane${i === 0 ? "" : " hidden"}" data-tab-pane="${tab.key}">
				${tab.api_path
					? `${tab.composer ? render_composer() : ""}
						<div class="logicx-ad-card-body is-log"></div>`
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

	// a log entry: when it was logged on the left of the header, how big the
	// body is on the right, and the body itself beneath -- newlines kept so a
	// JSON payload reads as it was sent. the card grows to whatever the body
	// needs, which is the point of a card over a table row.
	function render_log_card(content, creation) {
		const text = content || "";
		const time = creation ? format_log_time(creation) : "";
		const body = text
			? `<pre class="logicx-ad-entry-body">${frappe.utils.escape_html(text)}</pre>`
			: `<div class="logicx-ad-entry-body is-empty">${__("Empty")}</div>`;

		return `
			<article class="logicx-ad-entry">
				<header class="logicx-ad-entry-head">
					<span class="logicx-ad-entry-time">${time}</span>
					<span class="logicx-ad-entry-size">${format_bytes(text)}</span>
				</header>
				${body}
			</article>`;
	}

	// `creation` is stored in the system time zone; shifted to the user's, as
	// the desk's own Datetime formatter does, then laid out in the user's date
	// format with LOG_TIME_FORMAT after it
	function format_log_time(creation) {
		const at = frappe.datetime.convert_to_user_tz(creation, false);
		const date_format = frappe.datetime.get_user_date_fmt().toUpperCase();
		return at.format(`${date_format} ${LOG_TIME_FORMAT}`);
	}

	// the body's size on the wire, not its character count: the log stores
	// what came in as UTF-8, so a non-ASCII byte counts as what it cost.
	// format_number rather than frappe.format's Int, which wraps the figure in
	// a right-aligned block and pushes the unit onto its own line
	function format_bytes(text) {
		const bytes = new TextEncoder().encode(text).length;
		return `${format_number(bytes, null, 0)} B`;
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
		   so it draws no outline; the cards beneath keep their own */
		.logicx-ad-tabcard {
			background-color: transparent;
			border: none;
			border-radius: 0;
			box-shadow: none;
		}

		.logicx-ad-card-body {
			padding: var(--padding-md) var(--padding-lg);
		}

		/* the log scrolls inside its own pane instead of stretching the page.
		   max-height rather than height so a short result still shrinks to fit. */
		.logicx-ad-card-body.is-log {
			padding: 0;
			max-height: 70vh;
			overflow-y: auto;
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
		   own padding already spaces it from the log, so drop it */
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

		/* inline empty / error / loading line inside a log pane */
		.logicx-ad-note {
			padding: var(--padding-lg);
			font-size: var(--text-md);
			color: var(--text-muted);
			text-align: center;
		}

		.logicx-ad-note.is-error {
			color: var(--red-500);
		}

		/* one card per log entry, stacked newest first */
		.logicx-ad-log {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
			padding: var(--padding-sm) 0;
		}

		.logicx-ad-entry {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			overflow: hidden;
		}

		/* time on the left, size on the right, on a band the body sits under.
		   two steps darker than the body's --control-bg tint (the desk maps
		   both --subtle-fg and --control-bg to the same grey), so the two read
		   as two surfaces. the band is dark enough that muted text would sink
		   into it, so both figures take the full text colour. */
		.logicx-ad-entry-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--margin-md);
			padding: var(--padding-xs) var(--padding-md);
			background-color: var(--bg-dark-gray, var(--gray-300));
			border-bottom: 1px solid var(--border-color);
			font-size: var(--text-sm);
			color: var(--text-color);
		}

		/* the time gives way first when the band is narrow; the size never
		   shrinks or breaks, so it always reads as one figure on one line */
		.logicx-ad-entry-time {
			flex: 1 1 auto;
			min-width: 0;
			font-weight: 600;
			color: var(--text-color);
		}

		.logicx-ad-entry-size {
			flex: 0 0 auto;
			min-width: 7ch;
			text-align: right;
			font-variant-numeric: tabular-nums;
			white-space: nowrap;
		}

		/* the body keeps its line breaks and wraps long ones rather than
		   scrolling sideways; a <pre> with the desk's own styling reset. it
		   sits on the same mild tint the desk gives its inputs, so the payload
		   stands off the white page instead of floating on it */
		.logicx-ad-entry-body {
			margin: 0;
			padding: var(--padding-sm) var(--padding-md);
			background-color: var(--control-bg, var(--bg-light-gray));
			border: none;
			border-radius: 0;
			white-space: pre-wrap;
			overflow-wrap: anywhere;
			font-family: var(--font-stack-mono, monospace);
			font-size: var(--text-sm);
			line-height: 1.4;
			color: var(--text-color);
		}

		.logicx-ad-entry-body.is-empty {
			font-family: inherit;
			font-style: italic;
			color: var(--text-muted);
		}
	`;
})();
