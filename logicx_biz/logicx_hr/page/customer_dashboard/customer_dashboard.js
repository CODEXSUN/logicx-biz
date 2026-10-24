(function () {
	const PAGE_NAME = "customer-dashboard";
	const STYLE_ID = "logicx-customer-dashboard-styles";
	const DASHBOARD_METHOD = "logicx_biz.logicx_hr.customer_dashboard.get_dashboard";
	// the Mobile Dashboard's own: makes the Customer's Mobile No a Mobile
	// Contact before an Enquiry is opened on it (see new_enquiry)
	const ENSURE_CONTACT_METHOD = "logicx_biz.logicx_hr.mobile_dashboard.ensure_mobile_contact";

	// what the comment box and the WhatsApp button save: a Job Comments filed
	// on the Customer itself, its Job Type "Customer" and its Job ID the
	// Customer's name (see save_comment)
	const COMMENT_DOCTYPE = "Job Comments";
	const CUSTOMER_JOB_TYPE = "Customer";

	// where the WhatsApp button's script -- the Mobile Dashboard's, in its own
	// folder (mobile_dashboard/mobile_whatsapp/) -- puts its class. hooks.py's
	// page_js appends it to this page too, so it runs after this and is read
	// only from on_page_load on (see setup_whatsapp).
	frappe.provide("logicx_biz.mobile_dashboard");

	// exactly 10 digits, with no +91, spaces or dashes: the rule a Customer's
	// Mobile No is saved by (see logicx_erp/mobile_validation.py), and the only
	// number an Enquiry's Mobile, or WhatsApp, can be given. one saved before
	// that rule may be anything, and is then left unused.
	const MOBILE_PATTERN = /^\d{10}$/;

	// a Job Execution's status, as the pill it is shown in
	const EXECUTION_STATUS_COLORS = {
		Running: "orange",
		Completed: "green",
		Cancelled: "red",
	};

	// the tab strip, left to right, as on the Mobile Dashboard. `key` is the one
	// get_dashboard answers each tab under (see customer_dashboard.py), `columns`
	// what its table shows -- `type` decides how a value is formatted, and a
	// numeric one right-aligns it; `width` is the least a column is given,
	// stretched in proportion with the rest to fill the card (see fit_columns)
	// -- and `target` the document a click on one of its rows opens. a tab with
	// `cards` shows a card per row instead of a table, under the comment box when
	// it has `composer`; one with `empty` says what that hands it, and offers its
	// action, in place of "No records" (see render_tab). a job tab's Enquiry is
	// the row's own, and blank on a row filed on the Customer itself.
	const TABS = [
		{
			key: "enquiries",
			title: __("Enquiries"),
			columns: [
				{ id: "name", name: __("Enquiry"), width: 100 },
				{ id: "date", name: __("Date"), type: "Date", width: 100 },
				{ id: "title", name: __("Title"), width: 180 },
				// in place of the Customer, which every row shares
				{ id: "mobile", name: __("Mobile"), width: 110 },
				{ id: "group", name: __("List in"), width: 120 },
				{ id: "assigned_to_name", name: __("Assigned To"), width: 150 },
				{ id: "status", name: __("Status"), width: 110 },
			],
			target: (row) => ["Enquiry", row.name],
			// a Customer with no Enquiry yet is offered its first (see new_enquiry)
			empty: (dashboard) => ({
				text: __("No Enquiries for {0}.", [dashboard.customer_name]),
				action_html: new_enquiry_button(dashboard.customer_name),
			}),
		},
		{
			key: "job_activity",
			title: __("Activity"),
			columns: [
				{ id: "creation", name: __("Date / Time"), type: "Datetime", width: 150 },
				{ id: "enquiry", name: __("Enquiry"), width: 100 },
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
				{ id: "enquiry", name: __("Enquiry"), width: 100 },
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
				{ id: "enquiry", name: __("Enquiry"), width: 100 },
				{ id: "date", name: __("Date"), type: "Date", width: 100 },
				{ id: "item_name", name: __("Item Name"), width: 220 },
				{ id: "supplier_name", name: __("Vendor"), width: 200 },
				{ id: "price", name: __("Price"), type: "Currency", width: 120 },
			],
			target: (row) => ["Job Estimate", row.name],
		},
	];

	// the "..." menu, top to bottom. `open` is handed the dashboard, whose
	// Customer on screen is the one the new entry is opened on.
	const ADD_ACTIONS = [
		{
			key: "new-enquiry",
			label: __("New Enquiry"),
			open: (dashboard) => dashboard.new_enquiry(),
		},
	];

	// held across on_page_load / on_page_show, which frappe calls separately
	let dashboard = null;

	frappe.pages[PAGE_NAME].on_page_load = function (wrapper) {
		dashboard = new CustomerDashboard(wrapper);
	};

	frappe.pages[PAGE_NAME].on_page_show = function () {
		if (dashboard) dashboard.on_show();
	};

	class CustomerDashboard {
		constructor(wrapper) {
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: __("Customer Dashboard"),
				single_column: true,
			});

			inject_styles();

			this.$el = $('<div class="logicx-cd"></div>').appendTo(this.page.main).html(render_scaffold());

			this.tables = {};
			// the Customer picked last, and whether it was found -- there, and
			// one the user may see -- with the name and Mobile No it came back
			// with (see load)
			this.customer = "";
			this.found = false;
			this.customer_name = "";
			this.mobile = "";
			// bumped per load so a slow answer for a Customer the user has
			// already moved on from is dropped instead of landing under the new one
			this.seq = 0;
			// the rows handed to each tab, kept so switching tabs can build the
			// datatable while its pane is actually visible -- frappe-datatable
			// sizes its columns wrong inside a hidden pane. a click on a row is
			// looked up here too (see open_row).
			this.results = {};
			this.active_tab = TABS[0].key;
			// the URL is left alone until the first show has read it: the reset
			// below would otherwise wipe the very Customer a refresh is meant to
			// bring back (see write_url_params)
			this.url_ready = false;
			// frappe lazy-loads the datatable bundle; the report views await this
			// same call before constructing one, so the page does too
			this.datatable_ready = ensure_datatable();

			this.setup_customer();
			this.setup_composer();
			this.setup_whatsapp();
			this.setup_events();
			this.load("");
		}

		/* ------------------------------------------------------------ customer */

		// a Link to Customer: the page follows whatever it is set to (see
		// on_customer_change)
		setup_customer() {
			this.customer_control = frappe.ui.form.make_control({
				parent: this.$el.find('[data-filter="customer"]'),
				df: {
					fieldname: "customer",
					label: __("Customer"),
					// the label is off-screen, so the field names itself here
					placeholder: __("Customer"),
					fieldtype: "Link",
					options: "Customer",
					change: () => this.on_customer_change(),
				},
				render_input: true,
			});
		}

		// a standalone control fires its change on every set_value, and a Link
		// can fire it more than once for one pick, so only a Customer other than
		// the one on screen is loaded. an emptied box is "", which puts the page
		// back as it opened.
		on_customer_change() {
			const customer = this.customer_value();
			if (customer !== this.customer) this.load(customer);
		}

		customer_value() {
			return String(this.customer_control.get_value() || "").trim();
		}

		// the page put back as it opened, the box ready for the next Customer.
		// the Customer is let go of first, so the change the emptied box then
		// fires finds nothing new to load.
		clear_filters() {
			this.load("");
			this.customer_control.set_value("");
			this.customer_control.$input.trigger("focus");
		}

		// the Customer in the box read again, though it is the one on screen
		refresh() {
			this.load(this.customer_value());
		}

		on_show() {
			this.apply_prefill();
			if (!this.customer) this.customer_control.$input.trigger("focus");
		}

		apply_prefill() {
			// the router copies the URL's query string into route_options on every
			// route change, so this covers a refresh and the Back button as well
			// as another page routing here with a Customer already picked. the
			// URL is read directly too, for a desk that does not.
			const from_route = frappe.route_options || {};
			frappe.route_options = null;
			const from_url = frappe.utils.get_query_params() || {};
			this.url_ready = true;

			const customer = String(from_route.customer || from_url.customer || "").trim();

			// nothing asked for, or only what is already on screen -- as on Back to
			// this page, whose URL has followed every pick (see load). either way
			// the URL is brought up to date, since arriving from the sidebar clears it.
			if (!customer || customer === this.customer) {
				this.write_url_params();
				return;
			}

			// loaded first, so the change the box fires once it has checked the
			// link finds it on screen already. one that is no Customer is emptied
			// by that check, which puts the page back as it opened.
			this.load(customer);
			this.customer_control.set_value(customer);
		}

		// the Customer on screen is kept in the URL as ?customer=, so a browser
		// refresh, or a link copied from the address bar, opens on it again. the
		// URL is replaced rather than pushed: a pick is not a navigation, and Back
		// should leave the page rather than step through every Customer tried.
		// any other query parameter is left as it was.
		write_url_params() {
			// a load can be answered after the user has already moved on, and
			// the page they are on now has its own URL
			if (!this.url_ready || (frappe.get_route() || [])[0] !== PAGE_NAME) return;

			const params = new URLSearchParams(window.location.search);
			if (this.customer) params.set("customer", this.customer);
			else params.delete("customer");

			const query = params.toString();
			const search = query ? "?" + query : "";
			if (search === window.location.search) return;
			history.replaceState(history.state, "", window.location.pathname + search + window.location.hash);
		}

		/* ------------------------------------------------------------ composer */

		// the box above the Comments cards. its label stays in the markup,
		// off-screen as the Customer's is, so the box keeps an accessible name.
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
			const $post = this.$el.find(".logicx-cd-post").prop("disabled", true);

			this.save_comment(this.customer, text)
				.then(() => this.comment_control.set_value(""))
				// frappe has already shown the server's reason
				.catch(() => {})
				.finally(() => {
					this.posting = false;
					$post.prop("disabled", false);
				});
		}

		// `text` saved as a Job Comments filed on `customer` itself -- Job Type
		// Customer, Job ID its name, and so no Mobile (see
		// JobComments.set_mobile) -- as its form would save it, for the comment
		// box and the WhatsApp button both, with `note`, when given, as a dulled
		// last line (see note_to_html). saving it posts a Job Activity on the
		// Customer too (see JobComments.post_job_activity), and the Customer on
		// screen is then read again, quietly, for the new card and the new
		// activity. the promise is the save's, so a caller can tell a failed
		// one, whose reason frappe has already shown.
		save_comment(customer, text, note) {
			const seq = this.seq;
			const comment = text_to_html(text) + note_to_html(note);
			return frappe.db
				.insert({ doctype: COMMENT_DOCTYPE, job_type: CUSTOMER_JOB_TYPE, job_id: customer, comment })
				.then((doc) => {
					frappe.show_alert({ message: __("Comment added"), indicator: "green" });
					// another Customer picked since is already being read
					if (seq === this.seq) this.load(this.customer, { quiet: true });
					return doc;
				});
		}

		/* ------------------------------------------------------------ whatsapp */

		// the Mobile Dashboard's WhatsApp button (mobile_dashboard/mobile_whatsapp/),
		// built into its place in the bar just left of the "...". it is told the
		// number to send to whenever that changes -- the Customer's Mobile No,
		// when it is one (see set_found) -- and saves its message through
		// save_comment, as the comment box does, under the Customer on screen:
		// its dialog is modal, so that is still the Customer it was opened on
		// when Send is pressed. its SHARED_NOTE is kept for the cards to dull
		// (see render_comment_card). should its script not have been appended
		// -- hooks.py's page_js does not list it, or the site's cached hooks are
		// from before it did -- or fail to build, the place is left empty and
		// the rest of the page works on.
		setup_whatsapp() {
			const WhatsApp = logicx_biz.mobile_dashboard.whatsapp;
			if (!WhatsApp) {
				console.error(
					"Customer Dashboard: the WhatsApp button's script did not load. It is listed in hooks.py's page_js under customer-dashboard; after a change there, clear the site's cache."
				);
				return;
			}
			this.shared_note = WhatsApp.SHARED_NOTE || "";
			try {
				this.whatsapp = new WhatsApp({
					$wrapper: this.$el.find('[data-slot="whatsapp"]'),
					save_comment: (mobile, text, note) => this.save_comment(this.customer, text, note),
				});
			} catch (error) {
				console.error(error);
			}
		}

		/* ------------------------------------------------------------- loading */

		// everything on the page follows the Customer picked: every tab, the
		// comment box and the WhatsApp button. no Customer puts the page back as
		// it opened. loading the same Customer again asks again, which is how
		// the page is refreshed.
		// `quiet` is the Customer on screen read again after a comment is posted:
		// what the page shows stays until the answer replaces it, and is left
		// alone if none comes.
		load(customer, { quiet = false } = {}) {
			this.seq += 1;
			const seq = this.seq;
			this.customer = customer;
			this.write_url_params();
			if (!quiet) this.set_found(false);

			if (!customer) {
				this.show_notes(__("Select a customer to begin."));
				return;
			}
			if (!quiet) this.show_notes(__("Loading..."));

			frappe
				.call({ method: DASHBOARD_METHOD, args: { customer } })
				.then((r) => {
					if (seq !== this.seq) return;
					const message = (r && r.message) || {};
					if (!message.found) {
						this.set_found(false);
						this.show_notes(__("Customer {0} not found.", [customer]));
						return;
					}

					this.customer_name = message.customer_name || customer;
					this.mobile = message.mobile || "";
					this.set_found(true);
					const tabs = message.tabs || {};
					TABS.forEach((tab) => this.set_tab(tab.key, tabs[tab.key] || {}));
				})
				.catch((error) => {
					if (seq !== this.seq) return;
					if (quiet) {
						console.error(error);
						return;
					}
					this.show_notes(__("Could not load the dashboard."), true);
				});
		}

		// whether the Customer on screen was found. a comment is filed on it, so
		// the comment box is shown, and the WhatsApp button (which saves a
		// comment too) enabled, only then -- the button only for a Mobile No it
		// can send to.
		set_found(found) {
			this.found = found;
			this.$el.find(".logicx-cd-composer").toggleClass("hidden", !found);
			if (this.whatsapp) this.whatsapp.set_mobile(this.usable_mobile());
		}

		// the found Customer's Mobile No, when it is a number an Enquiry or
		// WhatsApp can take, and "" otherwise
		usable_mobile() {
			return this.found && MOBILE_PATTERN.test(this.mobile) ? this.mobile : "";
		}

		/* ---------------------------------------------------------------- tabs */

		setup_events() {
			this.$el.on("click", ".logicx-cd-tab", (e) => {
				this.activate_tab($(e.currentTarget).attr("data-tab"));
			});

			// a row stands for one document, and a click opens it -- in a new
			// browser tab with Ctrl / Cmd held, as a link would. only body rows
			// carry a row index: the header and the inline filter row above them
			// are the table's own.
			this.$el.on("click", ".logicx-cd-card-body.is-table .dt-row[data-row-index]", (e) => {
				const $row = $(e.currentTarget);
				this.open_row(
					$row.closest("[data-pane]").attr("data-pane"),
					Number($row.attr("data-row-index")),
					e.ctrlKey || e.metaKey
				);
			});

			this.$el.on("click", ".logicx-cd-clear", () => this.clear_filters());
			this.$el.on("click", ".logicx-cd-refresh", () => this.refresh());
			this.$el.on("click", ".logicx-cd-post", () => this.post_comment());

			// under an empty Enquiries tab (see new_enquiry_button)
			this.$el.on("click", ".logicx-cd-new-enquiry", (e) => this.new_enquiry($(e.currentTarget)));

			// the "..." menu: the button toggles it, a click anywhere else closes it
			this.$el.on("click", ".logicx-cd-add-btn", (e) => {
				e.stopPropagation();
				this.toggle_add_menu();
			});
			this.$el.on("click", ".logicx-cd-add-menu [data-action]", (e) => {
				e.preventDefault();
				this.toggle_add_menu(false);
				const action = ADD_ACTIONS.find((entry) => entry.key === $(e.currentTarget).attr("data-action"));
				if (action) action.open(this);
			});
			// namespaced so a reload of the page script does not stack a second one
			$(document).off("click.logicx-cd-add").on("click.logicx-cd-add", () => this.toggle_add_menu(false));
		}

		toggle_add_menu(open) {
			const $menu = this.$el.find(".logicx-cd-add-menu");
			const show = open === undefined ? !$menu.hasClass("show") : open;
			$menu.toggleClass("show", show);
			this.$el.find(".logicx-cd-add-btn").attr("aria-expanded", show ? "true" : "false");
		}

		activate_tab(key) {
			if (!key || key === this.active_tab) return;
			this.active_tab = key;

			this.$el.find(".logicx-cd-tab").each(function () {
				$(this).toggleClass("is-active", $(this).attr("data-tab") === key);
			});
			this.$el.find(".logicx-cd-tabpane").each(function () {
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
				.find(`.logicx-cd-tab[data-tab="${key}"] .logicx-cd-count`)
				.text(text)
				.toggleClass("hidden", !text);
		}

		// called both when a result lands and when its tab is opened, whichever
		// comes second; `rendered` is what keeps it from building twice
		render_tab(key) {
			const result = this.results[key];
			if (!result || result.seq !== this.seq || result.rendered) return;
			result.rendered = true;

			const tab = TABS.find((entry) => entry.key === key);
			if (!result.rows.length) {
				const empty = tab.empty ? tab.empty(this) : { text: __("No records") };
				this.show_note(key, empty.text, false, empty.action_html);
				return;
			}

			// cards need no bundle, and are built at once as one string: a
			// card per append would reflow the page once per card
			if (tab.cards) {
				const cards = result.rows.map((row) => render_comment_card(row, this.shared_note)).join("");
				this.$card_body(key).html(`<div class="logicx-cd-cards">${cards}</div>`);
				return;
			}

			const seq = this.seq;
			this.datatable_ready.then(() => {
				// the bundle may have loaded while the user moved on to another Customer
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
			return this.$el.find(`[data-pane="${key}"] .logicx-cd-card-body`);
		}

		show_note(key, text, is_error, action_html) {
			this.destroy_table(key);
			this.$card_body(key).html(note_html(text, is_error, action_html));
		}

		// the same line in every tab, in place of its table, with the counts
		// cleared: nothing is listed until a Customer has been found
		show_notes(text, is_error) {
			this.results = {};
			TABS.forEach((tab) => {
				this.set_count(tab.key, "");
				this.show_note(tab.key, text, is_error);
			});
		}

		/* ------------------------------------------------------------ add menu */

		// the "..." menu's New Enquiry, and the button under an empty Enquiries
		// tab: Enquiry's quick entry on the Customer on screen when it was found,
		// with its Mobile No as the Enquiry's Mobile when that is a number one
		// can take. an Enquiry's Mobile has to be a Mobile Contact, so the number
		// is made one first (see ensure_mobile_contact in mobile_dashboard.py) --
		// and stays one should the quick entry then be closed unsaved. `$btn`,
		// the button when there is one, is disabled while that runs, so it
		// cannot go twice.
		new_enquiry($btn) {
			const customer = this.found ? this.customer : "";
			const mobile = this.usable_mobile();
			if (!mobile) {
				this.open_new_enquiry(customer, "");
				return;
			}

			frappe
				.call({ method: ENSURE_CONTACT_METHOD, args: { mobile }, btn: $btn })
				.then(() => {
					// another Customer picked since: the contact is made, but this
					// is no longer the Customer to open the Enquiry on
					if (customer !== this.customer) return;
					this.open_new_enquiry(customer, mobile);
				})
				// frappe has already shown the server's reason
				.catch(() => {});
		}

		// once saved, the page moves to the new Enquiry's Customer -- `customer`,
		// unless it was changed in the dialog -- so the Enquiry shows up in the
		// first tab rather than the page being left for its form. one saved with
		// no Customer leaves the page on the one it was on, read again.
		open_new_enquiry(customer, mobile) {
			open_enquiry_quick_entry(customer, mobile, (doc) => {
				frappe.show_alert({
					message: __("Enquiry {0} created", [frappe.utils.get_form_link("Enquiry", doc.name, true)]),
					indicator: "green",
				});
				const next = doc.customer || this.customer;
				this.load(next);
				this.customer_control.set_value(next);
			});
		}
	}

	/* ==================================================================== markup */

	// the Customer at the left of the bar, Clear Filters and Refresh just past
	// it, and WhatsApp and the "..." at the right end, level with the bottom of
	// the box
	function render_scaffold() {
		return `
			<div class="logicx-cd-bar">
				<div class="logicx-cd-search" data-filter="customer"></div>
				${render_filter_actions()}
				<div class="logicx-cd-whatsapp" data-slot="whatsapp"></div>
				${render_add_menu()}
			</div>
			${render_tabcard()}
		`;
	}

	// what the box can be told besides a Customer (see clear_filters, refresh)
	function render_filter_actions() {
		return `
			<div class="logicx-cd-actions">
				<button type="button" class="btn btn-default btn-sm logicx-cd-clear">
					${__("Clear Filters")}
				</button>
				<button type="button" class="btn btn-default btn-sm logicx-cd-refresh">
					${__("Refresh")}
				</button>
			</div>
		`;
	}

	// the round "..." and the menu of what it can open on the Customer on screen
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
			<div class="logicx-cd-add">
				<button type="button" class="btn btn-primary logicx-cd-add-btn"
					title="${__("Actions")}" aria-label="${__("Actions")}"
					aria-haspopup="true" aria-expanded="false"></button>
				<div class="dropdown-menu logicx-cd-add-menu">${items}
				</div>
			</div>
		`;
	}

	// each tab carries a count of its rows once they are in (see set_tab)
	function render_tabcard() {
		const buttons = TABS.map(
			(tab, i) => `
			<button type="button" class="logicx-cd-tab${i === 0 ? " is-active" : ""}"
				data-tab="${tab.key}">
				${frappe.utils.escape_html(tab.title)}
				<span class="logicx-cd-count hidden"></span>
			</button>`
		).join("");

		const panes = TABS.map(
			(tab, i) => `
			<div class="logicx-cd-tabpane${i === 0 ? "" : " hidden"}" data-pane="${tab.key}">
				${tab.composer ? render_composer() : ""}
				<div class="logicx-cd-card-body ${tab.cards ? "is-cards" : "is-table"}"></div>
			</div>`
		).join("");

		return `
			<div class="logicx-cd-tabcard">
				<div class="logicx-cd-tabnav">${buttons}</div>
				${panes}
			</div>`;
	}

	// the muted line a tab shows in place of its table: before a pick, while
	// loading, when empty, or in red when the request failed -- and under it,
	// when there is one, the button that does something about it
	function note_html(text, is_error, action_html) {
		const css_class = is_error ? "logicx-cd-note is-error" : "logicx-cd-note";
		const action = action_html ? `<div class="logicx-cd-note-action">${action_html}</div>` : "";
		return `<div class="${css_class}"><div>${frappe.utils.escape_html(text)}</div>${action}</div>`;
	}

	// the comment box, and under it the Comment button. hidden until a
	// Customer is found (see set_found).
	function render_composer() {
		return `
			<div class="logicx-cd-composer hidden">
				<div class="logicx-cd-composer-field" data-field="comment"></div>
				<div class="logicx-cd-composer-foot">
					<button type="button" class="btn btn-primary btn-sm logicx-cd-post"
						title="${__("Ctrl+Enter")}">
						${__("Comment")}
					</button>
				</div>
			</div>`;
	}

	// a comment: when it was made and who made it on the header, and what was
	// written beneath, line for line. the text is plain already (see
	// _multiline_text in mobile_dashboard.py), and escaped here like every
	// value the page shows; a last line that is `note`, the WhatsApp button's,
	// is dulled as save_comment saved it. the time is the desk's own Datetime
	// format, as the Activity tab gives it.
	function render_comment_card(row, note) {
		const time = row.creation ? frappe.datetime.str_to_user(row.creation) : "";
		const head = `${time} - ${row.owner_name || row.owner || ""}:`;
		const body = row.text
			? `<div class="logicx-cd-entry-body">${comment_text_html(row.text, note)}</div>`
			: `<div class="logicx-cd-entry-body is-empty">${__("Empty")}</div>`;

		return `
			<article class="logicx-cd-entry">
				<header class="logicx-cd-entry-head">${frappe.utils.escape_html(head)}</header>
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

	// `note` as the comment's last line, after a blank one, in the desk's muted
	// grey -- an inline colour, which the Text Editor keeps where it would drop
	// a class, so the form shows it dulled too. "" when there is no note.
	function note_to_html(note) {
		if (!note) return "";
		const line = `<span style="color: var(--text-muted, #7c7c7c);">${frappe.utils.escape_html(note)}</span>`;
		return `<p><br></p><p>${line}</p>`;
	}

	// a card's text escaped, its last line dulled when that line is `note`
	function comment_text_html(text, note) {
		if (!note || (text !== note && !text.endsWith(`\n${note}`))) {
			return frappe.utils.escape_html(text);
		}
		const rest = text.slice(0, text.length - note.length);
		return `${frappe.utils.escape_html(rest)}<span class="logicx-cd-entry-note">${frappe.utils.escape_html(note)}</span>`;
	}

	// what goes under an empty Enquiries tab (see new_enquiry)
	function new_enquiry_button(customer_name) {
		return `
			<button type="button" class="btn btn-primary btn-sm logicx-cd-new-enquiry">
				${frappe.utils.escape_html(__("New Enquiry for {0}", [customer_name]))}
			</button>`;
	}

	/* ================================================================== add menu */

	// opened through make_quick_entry rather than frappe.new_doc, which takes no
	// after_insert and so opens the saved Enquiry's form instead of telling the
	// page about it. the new document is made here with the Customer and the
	// number already in it, and its defaults (Date, Priority, Status) applied as
	// new_doc would. should the quick entry fall back to the full form, that form
	// opens on the same document, Customer, number and all.
	function open_enquiry_quick_entry(customer, mobile, after_insert) {
		frappe.model.with_doctype("Enquiry", () => {
			const doc = frappe.model.get_new_doc("Enquiry");
			if (customer) doc.customer = customer;
			if (mobile) doc.mobile = mobile;
			frappe.ui.form.make_quick_entry("Enquiry", after_insert, null, doc);
		});
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
		.logicx-cd {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
			padding: var(--padding-sm) var(--padding-md) var(--padding-lg);
		}

		/* the Customer at the left, WhatsApp and the "..." pushed to the right
		   end. bottom-aligned, so the "..." stands level with the base of the box. */
		.logicx-cd-bar {
			display: flex;
			align-items: flex-end;
			gap: var(--margin-md);
			padding: var(--padding-md) 0 var(--padding-xs);
		}

		/* a Customer's name runs longer than a mobile number, so the box is wider
		   than the Mobile Dashboard's. it gives way on a narrow screen only as
		   far as a name still reads. */
		.logicx-cd-search {
			flex: 0 1 280px;
			min-width: 180px;
		}

		/* frappe's control markup ships its own bottom margin and an empty help
		   line under the box; neither has anything to space here, and either
		   would lift the box off the bottom the "..." is aligned to */
		.logicx-cd-search .frappe-control,
		.logicx-cd-search .form-group {
			margin-bottom: 0;
		}

		.logicx-cd-search .help-box {
			display: none;
		}

		/* the box reads plainly from its placeholder, so its label is dropped
		   from the layout. it stays in the markup, off-screen, so the input
		   keeps an accessible name. the comment box goes without one too. */
		.logicx-cd-search .control-label,
		.logicx-cd-composer-field .control-label {
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

		/* Clear Filters and Refresh, just past the box. centred on the bar, so
		   they read level with the box beside them. */
		.logicx-cd-actions {
			flex: 0 0 auto;
			align-self: center;
			display: flex;
			gap: var(--margin-sm);
		}

		/* the WhatsApp button's place (the Mobile Dashboard's mobile_whatsapp/
		   draws the button), pushed to the right end of the bar just ahead of
		   the "...". empty, should its script not load, it still pushes the
		   "..." there. */
		.logicx-cd-whatsapp {
			flex: 0 0 auto;
			margin-left: auto;
			display: flex;
			align-items: center;
		}

		/* the "..." takes only the room a round button needs, at the far right
		   of the bar where a page's action button sits, and anchors the menu
		   that drops from it. on a narrow screen the box gives way to it. */
		.logicx-cd-add {
			position: relative;
			flex: 0 0 auto;
			display: flex;
			align-items: center;
		}

		/* as on the Party Dashboard: .btn-primary gives it the desk's action
		   button shape, its colours softened below, and the "..." is three dots
		   in a row across the centre of the disc -- the middle one drawn, the
		   two either side of it its shadows */
		.logicx-cd-add-btn {
			position: relative;
			width: 34px;
			height: 34px;
			padding: 0;
			border-radius: 50%;
			box-shadow: var(--shadow-sm);
		}

		.logicx-cd-add-btn::before {
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
		.logicx-cd-add-btn,
		.logicx-cd-add-btn:focus {
			color: var(--gray-300) !important;
			background-color: var(--gray-700) !important;
			border-color: var(--gray-700) !important;
		}

		.logicx-cd-add-btn:hover,
		.logicx-cd-add-btn:active,
		.logicx-cd-add-btn[aria-expanded="true"] {
			color: var(--gray-300) !important;
			background-color: var(--gray-800) !important;
			border-color: var(--gray-800) !important;
		}

		/* pinned under the button's right edge, so it opens inward from the
		   page edge rather than off it */
		.logicx-cd-add-menu {
			top: 100%;
			right: 0;
			left: auto;
			margin-top: 4px;
			min-width: 180px;
		}

		.logicx-cd-add-menu.show {
			display: block;
		}

		.logicx-cd-tabnav {
			display: flex;
			flex-wrap: wrap;
			gap: var(--margin-lg);
			border-bottom: 1px solid var(--border-color);
		}

		.logicx-cd-tab {
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

		.logicx-cd-tab:hover {
			color: var(--text-color);
		}

		.logicx-cd-tab.is-active {
			color: var(--text-color);
			border-bottom-color: var(--primary, var(--text-color));
		}

		.logicx-cd-count {
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
		.logicx-cd-count.hidden,
		.logicx-cd-tabpane.hidden,
		.logicx-cd-composer.hidden {
			display: none;
		}

		.logicx-cd-tabpane {
			padding-top: var(--padding-md);
		}

		/* the datatable brings its own padding, so its body has none, and is
		   clipped to the outline it is read inside */
		.logicx-cd-card-body.is-table {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			overflow: hidden;
		}

		.logicx-cd-card-body.is-table .datatable {
			border: none;
		}

		/* every body row opens the document it stands for (see open_row) */
		.logicx-cd-card-body.is-table .dt-row[data-row-index] {
			cursor: pointer;
		}

		.logicx-cd-card-body.is-table .dt-row[data-row-index]:hover .dt-cell {
			background-color: var(--fg-hover-color, var(--gray-100));
		}

		/* each list scrolls inside its own outline instead of stretching the
		   page. max-height rather than height so a short list still shrinks to
		   fit; !important because frappe-datatable sets its own height inline. */
		.logicx-cd-card-body.is-table .dt-scrollable {
			max-height: 33333px !important;
			overflow-y: auto !important;
		}

		/* the comment box, and under it the Comment button on the left; above
		   the cards */
		.logicx-cd-composer {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
			padding-bottom: var(--padding-md);
		}

		/* as on the Customer's box: frappe's bottom margin and empty help line
		   have nothing to space, the composer's own gap does that */
		.logicx-cd-composer-field .frappe-control,
		.logicx-cd-composer-field .form-group {
			margin-bottom: 0;
		}

		.logicx-cd-composer-field .help-box {
			display: none;
		}

		.logicx-cd-composer-field textarea {
			min-height: 80px;
		}

		/* a row of its own, so the button keeps its own width rather than
		   stretching across the composer's column */
		.logicx-cd-composer-foot {
			display: flex;
		}

		/* the cards bring their own outlines, so their body draws none */
		.logicx-cd-cards {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
		}

		.logicx-cd-entry {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			overflow: hidden;
		}

		/* when and by whom, left-aligned on a band the comment sits under: two
		   steps darker than the body's tint, as on the Loom Dashboard, so the
		   two read as two surfaces, and dark enough to take the full text
		   colour */
		.logicx-cd-entry-head {
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
		.logicx-cd-entry-body {
			padding: var(--padding-sm) var(--padding-md);
			background-color: var(--control-bg, var(--bg-light-gray));
			white-space: pre-wrap;
			overflow-wrap: anywhere;
			font-size: var(--text-md);
			line-height: 1.5;
			color: var(--text-color);
		}

		.logicx-cd-entry-body.is-empty {
			font-style: italic;
			color: var(--text-muted);
		}

		/* the WhatsApp button's note under its message, dulled as on the form */
		.logicx-cd-entry-note {
			color: var(--text-muted);
		}

		/* an empty / loading / error line where there are no cards gets the
		   outline a table would have given it */
		.logicx-cd-card-body.is-cards > .logicx-cd-note {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
		}

		.logicx-cd-note {
			padding: var(--padding-lg);
			font-size: var(--text-md);
			color: var(--text-muted);
			text-align: center;
		}

		.logicx-cd-note.is-error {
			color: var(--red-500);
		}

		/* the button under a note, set apart from it (see note_html) */
		.logicx-cd-note-action {
			margin-top: var(--margin-md);
		}
	`;
})();
