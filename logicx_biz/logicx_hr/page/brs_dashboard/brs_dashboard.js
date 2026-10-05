(function () {
	const PAGE_NAME = "brs-dashboard";
	const STYLE_ID = "logicx-brs-dashboard-styles";

	// the tab strip, in order. Each tab is its own folder under this page --
	// brs_import/ for Import -- whose script hooks.py's page_js appends to this
	// one when the page is loaded. That script registers its class under the
	// tab's key in logicx_biz.brs_dashboard.tabs, and the class is built into the
	// tab's pane here (BRS-Dashboard.MD says what a tab's class is handed).
	const TABS = [{ key: "import", title: __("Import") }];

	// where the tabs' scripts put their classes. They run after this one, so it
	// is read only from on_page_load on, once the page's whole script has run.
	frappe.provide("logicx_biz.brs_dashboard.tabs");

	// held across on_page_load / on_page_show, which frappe calls separately
	let dashboard = null;

	frappe.pages[PAGE_NAME].on_page_load = function (wrapper) {
		dashboard = new BRSDashboard(wrapper);
	};

	// coming back to the page is the tab on screen coming back into view
	frappe.pages[PAGE_NAME].on_page_show = function () {
		if (dashboard) dashboard.show_tab(dashboard.active_tab);
	};

	class BRSDashboard {
		constructor(wrapper) {
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: __("BRS Dashboard"),
				single_column: true,
			});

			inject_styles();

			this.$el = $('<div class="logicx-bd"></div>').appendTo(this.page.main).html(render_scaffold());

			// per key, the tab built into its pane: each is built the first time it
			// is shown, so that a tab the user never opens never fetches anything
			this.tabs = {};
			this.active_tab = TABS[0].key;

			this.$el.on("click", ".logicx-bd-tab", (event) => {
				event.preventDefault();
				this.activate_tab($(event.currentTarget).attr("data-tab"));
			});

			// the first tab is on screen from the start. Only built here: frappe
			// calls on_page_show straight after this, and that tells it it is shown.
			this.build_tab(this.active_tab);

			function inject_styles() {
				let style = document.getElementById(STYLE_ID);
				if (!style) {
					style = document.createElement("style");
					style.id = STYLE_ID;
					document.head.appendChild(style);
				}
				style.textContent = PAGE_STYLES;
			}

			// the strip, and under it an empty pane per tab for its class to fill
			function render_scaffold() {
				const buttons = TABS.map(
					(tab, i) => `
					<button type="button" class="logicx-bd-tab${i === 0 ? " is-active" : ""}"
						data-tab="${tab.key}">
						${frappe.utils.escape_html(tab.title)}
					</button>`
				).join("");

				const panes = TABS.map(
					(tab, i) => `
					<div class="logicx-bd-tabpane${i === 0 ? "" : " hidden"}" data-tab-pane="${tab.key}"></div>`
				).join("");

				return `
					<div class="logicx-bd-tabnav">${buttons}</div>
					${panes}
				`;
			}
		}

		activate_tab(key) {
			if (!key || key === this.active_tab) return;
			this.active_tab = key;

			this.$el.find(".logicx-bd-tab").each(function () {
				$(this).toggleClass("is-active", $(this).attr("data-tab") === key);
			});
			this.$el.find(".logicx-bd-tabpane").each(function () {
				$(this).toggleClass("hidden", $(this).attr("data-tab-pane") !== key);
			});

			this.show_tab(key);
		}

		// the tab on screen, told so if it wants to know -- every time it comes
		// back, not only the first
		show_tab(key) {
			const tab = this.build_tab(key);
			if (tab && tab.on_show) tab.on_show();
		}

		// the tab's class, built into its pane the first time it is asked for
		build_tab(key) {
			if (this.tabs[key]) return this.tabs[key];

			const $pane = this.$el.find(`[data-tab-pane="${key}"]`);
			const Tab = logicx_biz.brs_dashboard.tabs[key];
			if (!Tab) {
				// its script was not appended: hooks.py's page_js does not list it,
				// or the hooks the site has cached are from before it did
				$pane.html(`<div class="logicx-bd-note is-error">${__(
					"This tab's script did not load. It is listed in hooks.py's page_js; after a change there, clear the site's cache."
				)}</div>`);
				return null;
			}
			return (this.tabs[key] = new Tab({ $wrapper: $pane }));
		}
	}

	/* ------------------------------------------------------------------ styles */

	// injected rather than a sibling .css for the same reason the other
	// dashboards do it: a standard Page's .css asset is not reliably served
	// across frappe versions. Each tab injects its own styles beside these.
	const PAGE_STYLES = `
		.logicx-bd {
			display: flex;
			flex-direction: column;
			gap: var(--margin-md);
			padding: var(--padding-sm) var(--padding-md) var(--padding-lg);
		}

		/* the tab strip reads as the page's header rather than as a box on it */
		.logicx-bd-tabnav {
			display: flex;
			flex-wrap: wrap;
			gap: var(--margin-lg);
			border-bottom: 1px solid var(--border-color);
		}

		.logicx-bd-tab {
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

		.logicx-bd-tab:hover {
			color: var(--text-color);
		}

		.logicx-bd-tab.is-active {
			color: var(--text-color);
			border-bottom-color: var(--primary, var(--text-color));
		}

		/* frappe's desk CSS defines .hidden too; repeated here so a pane's
		   visibility never depends on that global staying put */
		.logicx-bd-tabpane.hidden {
			display: none;
		}

		.logicx-bd-note {
			padding: var(--padding-lg);
			font-size: var(--text-md);
			color: var(--text-muted);
			text-align: center;
		}

		.logicx-bd-note.is-error {
			color: var(--red-500);
		}
	`;
})();
