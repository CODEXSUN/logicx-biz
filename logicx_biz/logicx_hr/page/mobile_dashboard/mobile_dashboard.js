(function () {
	const PAGE_NAME = "mobile-dashboard";
	const STYLE_ID = "logicx-mobile-dashboard-styles";
	const DASHBOARD_METHOD = "logicx_biz.logicx_hr.mobile_dashboard.get_dashboard";
	const ENSURE_CONTACT_METHOD = "logicx_biz.logicx_hr.mobile_dashboard.ensure_mobile_contact";

	// what the Comment button saves: a Job Comments on the number alone, with no
	// job (see JobComments.validate_job_or_mobile)
	const COMMENT_DOCTYPE = "Job Comments";

	// where the WhatsApp button's script, in its own folder (mobile_whatsapp/),
	// puts its class. hooks.py's page_js appends it to this one when the page
	// is loaded, so it runs after this and is read only from on_page_load on
	// (see setup_whatsapp).
	frappe.provide("logicx_biz.mobile_dashboard");

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
	// tab under (see mobile_dashboard.py), `columns` what its table shows --
	// `type` decides how a value is formatted, and a numeric one right-aligns it;
	// `width` is the least a column is given, stretched in proportion with the
	// rest to fill the card (see fit_columns) -- and `target` the document a
	// click on one of its rows opens. a tab with `cards` shows a card per row
	// instead of a table, under the comment box when it has `composer`.
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
			// cards rather than a table: a comment runs to as many lines as it
			// was written in
			key: "comments",
			title: __("Comments"),
			cards: true,
			composer: true,
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

	// the "..." menu, top to bottom. `open` is handed the dashboard, whose number
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
		dashboard = new MobileDashboard(wrapper);
	};

	frappe.pages[PAGE_NAME].on_page_show = function () {
		if (dashboard) dashboard.on_show();
	};

	class MobileDashboard {
		constructor(wrapper) {
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: __("Mobile Dashboard"),
				single_column: true,
			});

			inject_styles();

			this.$el = $('<div class="logicx-md"></div>').appendTo(this.page.main).html(render_scaffold());

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
			this.setup_composer();
			this.setup_whatsapp();
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
			this.$status = $('<span class="logicx-md-status hidden" role="img"></span>').appendTo(
				this.mobile_control.$wrapper.find(".control-input")
			);
		}

		search(value) {
			const mobile = String(value || "").trim();
			// the box shows what was searched for, spaces and all trimmed off
			this.mobile_control.set_input(mobile);
			this.load(mobile);
		}

		// an empty box puts the page back as it opened (see load), ready for
		// the next number to be typed
		clear_filters() {
			this.search("");
			this.mobile_control.$input.trigger("focus");
		}

		// Enter pressed on whatever the box holds: the number on screen asked
		// for again, or one typed since and not yet searched for
		refresh() {
			this.search(this.mobile_control.$input.val());
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

		/* ------------------------------------------------------------ composer */

		// the box above the Comments cards. its label stays in the markup,
		// off-screen as the number's is, so the box keeps an accessible name.
		setup_composer() {
			this.comment_control = frappe.ui.form.make_control({
				parent: this.$el.find('[data-field="comment"]'),
				df: {
					fieldname: "comment",
					label: __("Comment"),
					fieldtype: "Small Text",
				},
				render_input: true,
			});

			// Ctrl+Enter (Cmd+Enter on a Mac) posts without leaving the keyboard,
			// a plain Enter still breaks the line
			this.comment_control.$input.on("keydown", (e) => {
				if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
					e.preventDefault();
					this.post_comment();
				}
			});
		}

		// the button and Ctrl+Enter both land here. the box is cleared only
		// once the comment is saved, so a failed post leaves the text to retry.
		post_comment() {
			const text = (this.comment_control.get_value() || "").trim();
			if (!text || !this.found || this.posting) return;

			this.posting = true;
			const $post = this.$el.find(".logicx-md-post").prop("disabled", true);

			this.save_comment(this.mobile, text)
				.then(() => this.comment_control.set_value(""))
				// frappe has already shown the server's reason
				.catch(() => {})
				.finally(() => {
					this.posting = false;
					$post.prop("disabled", false);
				});
		}

		// `text` saved as a Job Comments on `mobile`, as its form would save it
		// -- for the comment box and the WhatsApp button both -- and the number
		// on screen then read again, quietly, for the new card. the promise is
		// the save's, so a caller can tell a failed one, whose reason frappe has
		// already shown.
		save_comment(mobile, text) {
			const seq = this.seq;
			return frappe.db
				.insert({ doctype: COMMENT_DOCTYPE, mobile, comment: text_to_html(text) })
				.then((doc) => {
					frappe.show_alert({ message: __("Comment added"), indicator: "green" });
					// another number searched for since is already being read
					if (seq === this.seq) this.load(this.mobile, { quiet: true });
					return doc;
				});
		}

		/* ------------------------------------------------------------ whatsapp */

		// the WhatsApp button, in its own folder (mobile_whatsapp/), built into
		// its place in the bar just left of the "...". it is told the number to
		// send to whenever that changes (see set_found), and saves its message
		// through save_comment, as the comment box does. should its script not
		// have been appended -- hooks.py's page_js does not list it, or the
		// site's cached hooks are from before it did -- or fail to build, the
		// place is left empty and the rest of the page works on.
		setup_whatsapp() {
			const WhatsApp = logicx_biz.mobile_dashboard.whatsapp;
			if (!WhatsApp) {
				console.error(
					"Mobile Dashboard: the WhatsApp button's script did not load. It is listed in hooks.py's page_js; after a change there, clear the site's cache."
				);
				return;
			}
			try {
				this.whatsapp = new WhatsApp({
					$wrapper: this.$el.find('[data-slot="whatsapp"]'),
					save_comment: (mobile, text) => this.save_comment(mobile, text),
				});
			} catch (error) {
				console.error(error);
			}
		}

		/* ------------------------------------------------------------- loading */

		// everything on the page follows the number searched for: the mark beside
		// it, and every tab. an empty box puts the page back as it opened; a
		// number that is not 10 digits is turned away without asking the server.
		// pressing Enter again on the same number asks again, which is how the
		// page is refreshed.
		// `quiet` is the number on screen read again after a comment is posted:
		// what the page shows stays until the answer replaces it, and is left
		// alone if none comes.
		load(mobile, { quiet = false } = {}) {
			this.seq += 1;
			const seq = this.seq;
			this.mobile = mobile;
			this.write_url_params();
			if (!quiet) this.set_found(false);

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

			if (!quiet) {
				this.set_status("loading");
				this.show_notes(__("Loading..."));
			}

			frappe
				.call({ method: DASHBOARD_METHOD, args: { mobile } })
				.then((r) => {
					if (seq !== this.seq) return;
					const message = (r && r.message) || {};
					if (!message.found) {
						this.set_found(false);
						this.set_status("missing");
						// with a way on: an Enquiry for the number all the same (see
						// new_enquiry_for)
						this.show_notes(
							__("No Mobile Contact found for {0}.", [mobile]),
							false,
							new_enquiry_button(mobile)
						);
						return;
					}

					this.set_found(true);
					this.set_status("found");
					const tabs = message.tabs || {};
					TABS.forEach((tab) => this.set_tab(tab.key, tabs[tab.key] || {}));
				})
				.catch((error) => {
					if (seq !== this.seq) return;
					if (quiet) {
						console.error(error);
						return;
					}
					this.set_status(null);
					this.show_notes(__("Could not load the dashboard."), true);
				});
		}

		// whether the number on screen is a Mobile Contact. a comment's Mobile
		// has to be one, so the comment box is shown, and the WhatsApp button
		// (which saves a comment too) enabled, only then.
		set_found(found) {
			this.found = found;
			this.$el.find(".logicx-md-composer").toggleClass("hidden", !found);
			if (this.whatsapp) this.whatsapp.set_mobile(found ? this.mobile : "");
		}

		set_status(state) {
			const status = STATUSES[state];
			this.$status
				.attr("class", "logicx-md-status " + (status ? status.css : "hidden"))
				.attr("title", status ? status.label : null)
				.attr("aria-label", status ? status.label : null)
				.html(status && status.icon ? ICONS[status.icon] : "");
		}

		/* ---------------------------------------------------------------- tabs */

		setup_events() {
			this.$el.on("click", ".logicx-md-tab", (e) => {
				this.activate_tab($(e.currentTarget).attr("data-tab"));
			});

			// a row stands for one document, and a click opens it -- in a new
			// browser tab with Ctrl / Cmd held, as a link would. only body rows
			// carry a row index: the header and the inline filter row above them
			// are the table's own.
			this.$el.on("click", ".logicx-md-card-body.is-table .dt-row[data-row-index]", (e) => {
				const $row = $(e.currentTarget);
				this.open_row(
					$row.closest("[data-pane]").attr("data-pane"),
					Number($row.attr("data-row-index")),
					e.ctrlKey || e.metaKey
				);
			});

			this.$el.on("click", ".logicx-md-clear", () => this.clear_filters());
			this.$el.on("click", ".logicx-md-refresh", () => this.refresh());
			this.$el.on("click", ".logicx-md-post", () => this.post_comment());

			// under "No Mobile Contact found" (see new_enquiry_button)
			this.$el.on("click", ".logicx-md-new-enquiry", (e) => {
				const $btn = $(e.currentTarget);
				this.new_enquiry_for($btn.attr("data-mobile"), $btn);
			});

			// the "..." menu: the button toggles it, a click anywhere else closes it
			this.$el.on("click", ".logicx-md-add-btn", (e) => {
				e.stopPropagation();
				this.toggle_add_menu();
			});
			this.$el.on("click", ".logicx-md-add-menu [data-action]", (e) => {
				e.preventDefault();
				this.toggle_add_menu(false);
				const action = ADD_ACTIONS.find((entry) => entry.key === $(e.currentTarget).attr("data-action"));
				if (action) action.open(this);
			});
			// namespaced so a reload of the page script does not stack a second one
			$(document).off("click.logicx-md-add").on("click.logicx-md-add", () => this.toggle_add_menu(false));
		}

		toggle_add_menu(open) {
			const $menu = this.$el.find(".logicx-md-add-menu");
			const show = open === undefined ? !$menu.hasClass("show") : open;
			$menu.toggleClass("show", show);
			this.$el.find(".logicx-md-add-btn").attr("aria-expanded", show ? "true" : "false");
		}

		activate_tab(key) {
			if (!key || key === this.active_tab) return;
			this.active_tab = key;

			this.$el.find(".logicx-md-tab").each(function () {
				$(this).toggleClass("is-active", $(this).attr("data-tab") === key);
			});
			this.$el.find(".logicx-md-tabpane").each(function () {
				$(this).toggleClass("hidden", $(this).attr("data-pane") !== key);
			});

			// build the datatable now that its pane is visible (see this.results)
			this.render_tab(key);
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
			// mobile_dashboard.py)
			this.set_count(key, more ? `${rows.length}+` : String(rows.length));
			if (key === this.active_tab) this.render_tab(key);
		}

		set_count(key, text) {
			this.$el
				.find(`.logicx-md-tab[data-tab="${key}"] .logicx-md-count`)
				.text(text)
				.toggleClass("hidden", !text);
		}

		// called both when a result lands and when its tab is opened, whichever
		// comes second; `rendered` is what keeps it from building twice
		render_tab(key) {
			const result = this.results[key];
			if (!result || result.seq !== this.seq || result.rendered) return;
			result.rendered = true;

			if (!result.rows.length) {
				this.show_note(key, __("No records"));
				return;
			}

			// cards need no bundle, and are built at once as one string: a
			// card per append would reflow the page once per card
			const tab = TABS.find((entry) => entry.key === key);
			if (tab.cards) {
				const cards = result.rows.map(render_comment_card).join("");
				this.$card_body(key).html(`<div class="logicx-md-cards">${cards}</div>`);
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
				columns: fit_columns(tab.columns.map(to_datatable_column), $body.get(0).clientWidth),
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

		destroy_table(key) {
			const table = this.tables[key];
			if (table && typeof table.destroy === "function") table.destroy();
			this.tables[key] = null;
		}

		$card_body(key) {
			return this.$el.find(`[data-pane="${key}"] .logicx-md-card-body`);
		}

		show_note(key, text, is_error, action_html) {
			this.destroy_table(key);
			this.$card_body(key).html(note_html(text, is_error, action_html));
		}

		// the same line in every tab, in place of its table, with the counts
		// cleared: nothing is listed until a Mobile Contact has been found
		show_notes(text, is_error, action_html) {
			this.results = {};
			TABS.forEach((tab) => {
				this.set_count(tab.key, "");
				this.show_note(tab.key, text, is_error, action_html);
			});
		}

		/* ------------------------------------------------------------ add menu */

		// Enquiry's quick entry, on `mobile` when there is one. once saved, the
		// page moves to the new Enquiry's number -- `mobile`, unless it was
		// changed in the dialog -- so the Enquiry shows up in the first tab
		// rather than the page being left for its form.
		open_new_enquiry(mobile) {
			open_enquiry_quick_entry(mobile, (doc) => {
				frappe.show_alert({
					message: __("Enquiry {0} created", [frappe.utils.get_form_link("Enquiry", doc.name, true)]),
					indicator: "green",
				});
				this.mobile_control.set_input(doc.mobile || "");
				this.load(doc.mobile || "");
			});
		}

		// the "..." menu's New Enquiry: on the number on screen when it is a
		// Mobile Contact, and on none otherwise
		new_enquiry() {
			this.open_new_enquiry(this.found ? this.mobile : "");
		}

		// the button under "No Mobile Contact found". an Enquiry's Mobile has to
		// be a Mobile Contact, so the number is made one first (see
		// ensure_mobile_contact in mobile_dashboard.py) -- and stays one should
		// the quick entry then be closed unsaved. the page is reloaded to show
		// the number found, and the quick entry opens on it.
		new_enquiry_for(mobile, $btn) {
			const seq = this.seq;
			frappe
				// `btn` disables the button while this runs, so it cannot go twice
				.call({ method: ENSURE_CONTACT_METHOD, args: { mobile }, btn: $btn })
				.then(() => {
					// another number searched for since: the contact is made, but it
					// is no longer the number on screen to open the Enquiry on
					if (seq !== this.seq) return;
					this.load(mobile);
					this.open_new_enquiry(mobile);
				})
				// frappe has already shown the server's reason
				.catch(() => {});
		}
	}

	/* ==================================================================== markup */

	// the number at the left of the bar, Clear Filters and Refresh just past
	// its mark, and WhatsApp and the "..." at the right end, level with the
	// bottom of the box
	function render_scaffold() {
		return `
			<div class="logicx-md-bar">
				<div class="logicx-md-search" data-filter="mobile"></div>
				${render_filter_actions()}
				<div class="logicx-md-whatsapp" data-slot="whatsapp"></div>
				${render_add_menu()}
			</div>
			${render_tabcard()}
		`;
	}

	// what the box can be told besides a number (see clear_filters, refresh)
	function render_filter_actions() {
		return `
			<div class="logicx-md-actions">
				<button type="button" class="btn btn-default btn-sm logicx-md-clear">
					${__("Clear Filters")}
				</button>
				<button type="button" class="btn btn-default btn-sm logicx-md-refresh">
					${__("Refresh")}
				</button>
			</div>
		`;
	}

	// the round "..." and the menu of what it can open on the number on screen
	// (see ADD_ACTIONS). shown and hidden by hand (see setup_events) rather than
	// by bootstrap's data attributes, so it works the same whichever bootstrap
	// the desk ships; only the .dropdown-menu look and its .show state are
	// borrowed. the "..." is drawn in css, as on the Party Dashboard, and the
	// button's aria-label names it.
	function render_add_menu() {
		const items = ADD_ACTIONS.map(
			(action) => `
					<a class="dropdown-item" href="#" data-action="${action.key}">
						${frappe.utils.escape_html(action.label)}
					</a>`
		).join("");

		return `
			<div class="logicx-md-add">
				<button type="button" class="btn btn-primary logicx-md-add-btn"
					title="${__("Actions")}" aria-label="${__("Actions")}"
					aria-haspopup="true" aria-expanded="false"></button>
				<div class="dropdown-menu logicx-md-add-menu">${items}
				</div>
			</div>
		`;
	}

	// each tab carries a count of its rows once they are in (see set_tab)
	function render_tabcard() {
		const buttons = TABS.map(
			(tab, i) => `
			<button type="button" class="logicx-md-tab${i === 0 ? " is-active" : ""}"
				data-tab="${tab.key}">
				${frappe.utils.escape_html(tab.title)}
				<span class="logicx-md-count hidden"></span>
			</button>`
		).join("");

		const panes = TABS.map(
			(tab, i) => `
			<div class="logicx-md-tabpane${i === 0 ? "" : " hidden"}" data-pane="${tab.key}">
				${tab.composer ? render_composer() : ""}
				<div class="logicx-md-card-body ${tab.cards ? "is-cards" : "is-table"}"></div>
			</div>`
		).join("");

		return `
			<div class="logicx-md-tabcard">
				<div class="logicx-md-tabnav">${buttons}</div>
				${panes}
			</div>`;
	}

	// the muted line a tab shows in place of its table: before a search, while
	// loading, when empty, or in red when the request failed -- and under it,
	// when there is one, the button that does something about it
	function note_html(text, is_error, action_html) {
		const css_class = is_error ? "logicx-md-note is-error" : "logicx-md-note";
		const action = action_html ? `<div class="logicx-md-note-action">${action_html}</div>` : "";
		return `<div class="${css_class}"><div>${frappe.utils.escape_html(text)}</div>${action}</div>`;
	}

	// the comment box, and under it the Comment button. hidden until a Mobile
	// Contact is found (see set_found).
	function render_composer() {
		return `
			<div class="logicx-md-composer hidden">
				<div class="logicx-md-composer-field" data-field="comment"></div>
				<div class="logicx-md-composer-foot">
					<button type="button" class="btn btn-primary btn-sm logicx-md-post"
						title="${__("Ctrl+Enter")}">
						${__("Comment")}
					</button>
				</div>
			</div>`;
	}

	// a comment: when it was made and who made it on the header, and what was
	// written beneath, line for line. the text is plain already (see
	// _multiline_text in mobile_dashboard.py), and escaped here like every
	// value the page shows. the time is the desk's own Datetime format, as
	// the Activity tab gives it.
	function render_comment_card(row) {
		const time = row.creation ? frappe.datetime.str_to_user(row.creation) : "";
		const head = `${time} - ${row.owner_name || row.owner || ""}:`;
		const body = row.text
			? `<div class="logicx-md-entry-body">${frappe.utils.escape_html(row.text)}</div>`
			: `<div class="logicx-md-entry-body is-empty">${__("Empty")}</div>`;

		return `
			<article class="logicx-md-entry">
				<header class="logicx-md-entry-head">${frappe.utils.escape_html(head)}</header>
				${body}
			</article>`;
	}

	// the box's plain text as the HTML a Text Editor holds -- a paragraph per
	// line, an empty one written as the editor writes it -- so the comment
	// opens on its form line for line
	function text_to_html(text) {
		return text
			.split("\n")
			.map((line) => `<p>${frappe.utils.escape_html(line) || "<br>"}</p>`)
			.join("");
	}

	// what goes under "No Mobile Contact found" (see new_enquiry_for)
	function new_enquiry_button(mobile) {
		return `
			<button type="button" class="btn btn-primary btn-sm logicx-md-new-enquiry"
				data-mobile="${frappe.utils.escape_html(mobile)}">
				${frappe.utils.escape_html(__("New Enquiry for {0}", [mobile]))}
			</button>`;
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

	// frappe-datatable's "fluid" layout keeps none of the widths it is handed: it
	// measures each column by its header text and shares whatever room is left
	// out equally, so every column comes out much the same. the table is built
	// "fixed" instead, which keeps them, and they are stretched here in
	// proportion to fill the card -- never shrunk, so a list wider than the card
	// scrolls sideways rather than cramping every column to fit.
	function fit_columns(columns, available) {
		// each cell draws a 1px border beside the width its content is given,
		// and a couple of pixels are kept spare so rounding never tips the row
		// past the card into a scrollbar
		const room = available - columns.length - 2;
		const total = columns.reduce((sum, col) => sum + col.width, 0);
		if (!(room > total)) return columns;

		const fitted = columns.map((col) =>
			Object.assign({}, col, { width: Math.floor((col.width * room) / total) })
		);
		// whatever the flooring left over goes to the last column, so the row
		// ends flush with the card
		fitted[fitted.length - 1].width += room - fitted.reduce((sum, col) => sum + col.width, 0);
		return fitted;
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
		.logicx-md {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
			padding: var(--padding-sm) var(--padding-md) var(--padding-lg);
		}

		/* the number at the left, the "..." pushed to the right end. bottom-aligned,
		   so the "..." stands level with the base of the box. */
		.logicx-md-bar {
			display: flex;
			align-items: flex-end;
			gap: var(--margin-md);
			padding: var(--padding-md) 0 var(--padding-xs);
		}

		/* wide enough for a 10-digit number and the placeholder, and no wider.
		   it gives way on a narrow screen only as far as the number still
		   reads whole. the right margin is the room the found / not-found mark
		   takes beside the box (see .logicx-md-status) */
		.logicx-md-search {
			flex: 0 1 160px;
			min-width: 120px;
			margin-right: 30px;
		}

		/* frappe's control markup ships its own bottom margin and an empty help
		   line under the box; neither has anything to space here, and either
		   would lift the box off the bottom the "..." is aligned to */
		.logicx-md-search .frappe-control,
		.logicx-md-search .form-group {
			margin-bottom: 0;
		}

		.logicx-md-search .help-box {
			display: none;
		}

		/* the box reads plainly from its placeholder, so its label is dropped
		   from the layout. it stays in the markup, off-screen, so the input
		   keeps an accessible name. the comment box goes without one too. */
		.logicx-md-search .control-label,
		.logicx-md-composer-field .control-label {
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

		.logicx-md-search .control-input {
			position: relative;
		}

		.logicx-md-search input {
			font-variant-numeric: tabular-nums;
			letter-spacing: 0.04em;
		}

		/* the found / not-found mark: a disc just past the box's right edge, in
		   the room the search's right margin keeps for it. placed against the
		   input itself, so it centres on the box whatever else the control's
		   markup holds. */
		.logicx-md-status {
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

		.logicx-md-status.hidden {
			display: none;
		}

		.logicx-md-status svg {
			width: 14px;
			height: 14px;
			fill: none;
			stroke: currentColor;
			stroke-width: 2.25;
			stroke-linecap: round;
			stroke-linejoin: round;
		}

		.logicx-md-status.is-found {
			background-color: var(--green-500);
		}

		.logicx-md-status.is-missing {
			background-color: var(--red-500);
		}

		/* a ring with one quarter missing, turning, while the number is looked up */
		.logicx-md-status.is-loading {
			width: 18px;
			height: 18px;
			margin-left: 2px;
			border: 2px solid var(--gray-300);
			border-top-color: var(--gray-600);
			animation: logicx-md-spin 0.7s linear infinite;
		}

		@keyframes logicx-md-spin {
			from { transform: translateY(-50%) rotate(0deg); }
			to { transform: translateY(-50%) rotate(360deg); }
		}

		/* Clear Filters and Refresh, just past the found / not-found mark --
		   the search's right margin is what keeps them clear of it. centred on
		   the bar, so they read level with the box beside them. */
		.logicx-md-actions {
			flex: 0 0 auto;
			align-self: center;
			display: flex;
			gap: var(--margin-sm);
		}

		/* the WhatsApp button's place (mobile_whatsapp/ draws the button),
		   pushed to the right end of the bar just ahead of the "...". empty,
		   should its script not load, it still pushes the "..." there. */
		.logicx-md-whatsapp {
			flex: 0 0 auto;
			margin-left: auto;
			display: flex;
			align-items: center;
		}

		/* the "..." takes only the room a round button needs, at the far right
		   of the bar where a page's action button sits, and anchors the menu
		   that drops from it. on a narrow screen the box gives way to it. */
		.logicx-md-add {
			position: relative;
			flex: 0 0 auto;
			display: flex;
			align-items: center;
		}

		/* as on the Party Dashboard: .btn-primary gives it the desk's action
		   button shape, its colours softened below, and the "..." is three dots
		   in a row across the centre of the disc -- the middle one drawn, the
		   two either side of it its shadows */
		.logicx-md-add-btn {
			position: relative;
			width: 34px;
			height: 34px;
			padding: 0;
			border-radius: 50%;
			box-shadow: var(--shadow-sm);
		}

		.logicx-md-add-btn::before {
			content: "";
			position: absolute;
			top: 50%;
			left: 50%;
			width: 4px;
			height: 4px;
			border-radius: 50%;
			background-color: currentColor;
			box-shadow: -7px 0 0 currentColor, 7px 0 0 currentColor;
			transform: translate(-50%, -50%);
		}

		/* !important because frappe's .btn-primary sets its colours on hover,
		   focus and active too, and these should hold through all of them */
		.logicx-md-add-btn,
		.logicx-md-add-btn:focus {
			color: var(--gray-300) !important;
			background-color: var(--gray-700) !important;
			border-color: var(--gray-700) !important;
		}

		.logicx-md-add-btn:hover,
		.logicx-md-add-btn:active,
		.logicx-md-add-btn[aria-expanded="true"] {
			color: var(--gray-300) !important;
			background-color: var(--gray-800) !important;
			border-color: var(--gray-800) !important;
		}

		/* pinned under the button's right edge, so it opens inward from the
		   page edge rather than off it */
		.logicx-md-add-menu {
			top: 100%;
			right: 0;
			left: auto;
			margin-top: 4px;
			min-width: 180px;
		}

		.logicx-md-add-menu.show {
			display: block;
		}

		.logicx-md-tabnav {
			display: flex;
			flex-wrap: wrap;
			gap: var(--margin-lg);
			border-bottom: 1px solid var(--border-color);
		}

		.logicx-md-tab {
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

		.logicx-md-tab:hover {
			color: var(--text-color);
		}

		.logicx-md-tab.is-active {
			color: var(--text-color);
			border-bottom-color: var(--primary, var(--text-color));
		}

		.logicx-md-count {
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
		.logicx-md-count.hidden,
		.logicx-md-tabpane.hidden,
		.logicx-md-composer.hidden {
			display: none;
		}

		.logicx-md-tabpane {
			padding-top: var(--padding-md);
		}

		/* the datatable brings its own padding, so its body has none, and is
		   clipped to the outline it is read inside */
		.logicx-md-card-body.is-table {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			overflow: hidden;
		}

		.logicx-md-card-body.is-table .datatable {
			border: none;
		}

		/* every body row opens the document it stands for (see open_row) */
		.logicx-md-card-body.is-table .dt-row[data-row-index] {
			cursor: pointer;
		}

		.logicx-md-card-body.is-table .dt-row[data-row-index]:hover .dt-cell {
			background-color: var(--fg-hover-color, var(--gray-100));
		}

		/* each list scrolls inside its own outline instead of stretching the
		   page. max-height rather than height so a short list still shrinks to
		   fit; !important because frappe-datatable sets its own height inline. */
		.logicx-md-card-body.is-table .dt-scrollable {
			max-height: 33333px !important;
			overflow-y: auto !important;
		}

		/* the comment box, and under it the Comment button on the left; above
		   the cards */
		.logicx-md-composer {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
			padding-bottom: var(--padding-md);
		}

		/* as on the number's box: frappe's bottom margin and empty help line
		   have nothing to space, the composer's own gap does that */
		.logicx-md-composer-field .frappe-control,
		.logicx-md-composer-field .form-group {
			margin-bottom: 0;
		}

		.logicx-md-composer-field .help-box {
			display: none;
		}

		.logicx-md-composer-field textarea {
			min-height: 80px;
		}

		/* a row of its own, so the button keeps its own width rather than
		   stretching across the composer's column */
		.logicx-md-composer-foot {
			display: flex;
		}

		/* the cards bring their own outlines, so their body draws none */
		.logicx-md-cards {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
		}

		.logicx-md-entry {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			overflow: hidden;
		}

		/* when and by whom, left-aligned on a band the comment sits under: two
		   steps darker than the body's tint, as on the Loom Dashboard, so the
		   two read as two surfaces, and dark enough to take the full text
		   colour */
		.logicx-md-entry-head {
			padding: var(--padding-xs) var(--padding-md);
			background-color: var(--bg-dark-gray, var(--gray-300));
			border-bottom: 1px solid var(--border-color);
			font-size: var(--text-sm);
			font-weight: 600;
			color: var(--text-color);
			text-align: left;
		}

		/* the comment keeps its line breaks and wraps long ones rather than
		   scrolling sideways, on the tint the desk gives its inputs */
		.logicx-md-entry-body {
			padding: var(--padding-sm) var(--padding-md);
			background-color: var(--control-bg, var(--bg-light-gray));
			white-space: pre-wrap;
			overflow-wrap: anywhere;
			font-size: var(--text-md);
			line-height: 1.5;
			color: var(--text-color);
		}

		.logicx-md-entry-body.is-empty {
			font-style: italic;
			color: var(--text-muted);
		}

		/* an empty / loading / error line where there are no cards gets the
		   outline a table would have given it */
		.logicx-md-card-body.is-cards > .logicx-md-note {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
		}

		.logicx-md-note {
			padding: var(--padding-lg);
			font-size: var(--text-md);
			color: var(--text-muted);
			text-align: center;
		}

		.logicx-md-note.is-error {
			color: var(--red-500);
		}

		/* the button under a note, set apart from it (see note_html) */
		.logicx-md-note-action {
			margin-top: var(--margin-md);
		}
	`;
})();
