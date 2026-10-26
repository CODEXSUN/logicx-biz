// The Member Dashboard: one member -- an Employee -- in three tabs: Jobs and
// Leads, their Enquiries, and Duty, their SOPs. Two pages build it:
//
// - the Member Dashboard (member-dashboard), on the member picked in its box
//   and kept in the URL as ?member= -- MemberDashboard;
// - the Member Self Dashboard (member-self-dashboard), on the member looking
//   at it -- MemberSelfDashboard, the same dashboard with the member left to
//   the server, which knows who is logged in.
//
// Not a page of its own. hooks.py's page_js appends this file to both pages'
// scripts when they are loaded, and each builds its dashboard out of the class
// this registers, from on_page_load on.
(function () {
	// the page that picks its member, and keeps it in its URL (see
	// write_url_params)
	const PAGE_NAME = "member-dashboard";
	const STYLE_ID = "logicx-member-dashboard-styles";
	const TAB_METHOD = "logicx_biz.logicx_hr.member_dashboard.get_tab";

	// where a click on a Jobs or Leads row goes: the Mobile Dashboard, opened
	// on the Enquiry's Mobile, which that page reads off route_options or the
	// URL's ?mobile= (see its apply_prefill)
	const MOBILE_DASHBOARD = "mobile-dashboard";

	// where a click on a Duty row goes: this list, filtered by the member and
	// the row's SOP (see open_duty_reporting)
	const DUTY_REPORTING = "Duty Reporting";

	// the box above the Jobs and Leads tables, unticked as the page opens: until
	// it is ticked the tab leaves out the Enquiries whose Status is in the Closed
	// group -- Won, Lost, Closed and Duplicate as seeded (see get_tab)
	const show_closed = (label) => ({ key: "show_closed", label, fieldtype: "Check" });

	// the tab strip, left to right. `key` is the tab get_tab is asked for (see
	// member_dashboard.py), `filters` the boxes above its table -- each sent to
	// get_tab under its `key` (see filter_values) -- and `columns` what that
	// table shows: `type` decides how a value is formatted, `align` where it
	// sits in its cell (left unless given), and `width` is what a column is
	// given, the one marked `stretch` taking whatever room the card has left
	// over on top (see fit_columns). `open` is where a click on a row goes,
	// handed the row and whether Ctrl / Cmd was held (see open_row): every row
	// carries what that needs, though no column may show it.
	const TABS = [
		{
			// the Enquiries assigned to the member
			key: "jobs",
			title: __("Jobs"),
			filters: [show_closed(__("Show Closed Jobs"))],
			open: open_enquiry,
			columns: [
				{ id: "name", name: __("Q#"), width: 100 },
				{ id: "date", name: __("Date"), type: "Date", width: 125, align: "center" },
				{ id: "title", name: __("Title"), width: 180, stretch: true },
				{ id: "customer_name", name: __("Customer"), width: 200 },
				{ id: "group", name: __("List in"), width: 125 },
				{ id: "created_by_name", name: __("Lead By"), width: 200 },
				{ id: "status", name: __("Status"), width: 125 },
			],
		},
		{
			// the Enquiries the member created
			key: "leads",
			title: __("Leads"),
			filters: [show_closed(__("Show Closed Leads"))],
			open: open_enquiry,
			columns: [
				{ id: "name", name: __("Q#"), width: 100 },
				{ id: "date", name: __("Date"), type: "Date", width: 125, align: "center" },
				{ id: "title", name: __("Title"), width: 180, stretch: true },
				{ id: "customer_name", name: __("Customer"), width: 200 },
				{ id: "group", name: __("List in"), width: 125 },
				{ id: "assigned_to_name", name: __("Assigned To"), width: 200 },
				{ id: "status", name: __("Status"), width: 125 },
			],
		},
		{
			// the SOPs the member is assigned, as Duties, by Index
			key: "duty",
			title: __("Duty"),
			filters: [
				{ key: "department", label: __("Department"), fieldtype: "Link", options: "Department" },
				// its options are SOP's own Frequency ones -- Daily, Weekly,
				// Monthly and Yearly as shipped -- filled in once they are read
				// (see load_options)
				{
					key: "frequency",
					label: __("Frequency"),
					fieldtype: "Select",
					options_from: ["SOP", "frequency"],
				},
			],
			open: open_duty_reporting,
			columns: [
				{ id: "index", name: __("Index"), width: 90, align: "right" },
				{ id: "sop_name", name: __("SOP Name"), width: 260, stretch: true },
				{ id: "department", name: __("Department"), width: 200 },
				{ id: "frequency", name: __("Frequency"), width: 125 },
			],
		},
	];

	class MemberDashboard {
		constructor(wrapper) {
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: this.title(),
				single_column: true,
			});

			inject_styles();

			this.$el = $('<div class="logicx-mbd"></div>')
				.appendTo(this.page.main)
				.html(render_scaffold(this.render_member()));

			this.tables = {};
			// the Employee the tabs are read for: "" until one is picked (see
			// pick_member)
			this.member = "";
			// the rows handed to each tab, kept so switching tabs can build the
			// datatable while its pane is actually visible -- frappe-datatable
			// sizes its columns wrong inside a hidden pane. a click on a row is
			// looked up here too (see open_row).
			this.results = {};
			// bumped per read of a tab, so a slow answer is dropped instead of
			// landing over the one asked for since -- its box ticked again, say
			this.seqs = {};
			this.active_tab = TABS[0].key;
			// the page's first show is its opening, which the read below covers
			// (see on_show)
			this.shown = false;
			// the URL is left alone until the first show has read it: writing it
			// sooner would wipe the very member a refresh is meant to bring back
			// (see write_url_params)
			this.url_ready = false;
			// frappe lazy-loads the datatable bundle; the report views await this
			// same call before constructing one, so the page does too
			this.datatable_ready = ensure_datatable();

			this.setup_member();
			this.setup_filters();
			this.setup_events();
			this.load();
		}

		title() {
			return __("Member Dashboard");
		}

		/* -------------------------------------------------------------- member */

		// the box the member is picked in at the left of the bar, and their
		// name beside it once a tab has answered (see set_member): the box
		// itself shows only the Employee ID
		render_member() {
			return `
				<div class="logicx-mbd-search" data-filter="member"></div>
				<div class="logicx-mbd-member">
					<span class="logicx-mbd-member-name"></span>
				</div>`;
		}

		// a Link to Employee: the page follows whatever it is set to (see
		// on_member_change)
		setup_member() {
			this.member_control = frappe.ui.form.make_control({
				parent: this.$el.find('[data-filter="member"]'),
				df: {
					fieldname: "member",
					label: __("Member"),
					// the label is off-screen, so the field names itself here
					placeholder: __("Member"),
					fieldtype: "Link",
					options: "Employee",
					change: () => this.on_member_change(),
				},
				render_input: true,
			});
		}

		// a standalone control fires its change on every set_value, and a Link
		// can fire it more than once for one pick, so only a member other than
		// the one on screen is read. an emptied box is "", which puts the page
		// back as it opened.
		on_member_change() {
			const member = this.member_value();
			if (member !== this.member) this.pick_member(member);
		}

		member_value() {
			return String(this.member_control.get_value() || "").trim();
		}

		// every tab read afresh for `member`, the name of the one before
		// dropped meanwhile, and the URL following
		pick_member(member) {
			this.member = member;
			this.show_member_name("");
			this.write_url_params();
			this.load();
		}

		// whether there is a member to read the tabs for (see load_tab)
		member_picked() {
			return Boolean(this.member);
		}

		// what get_tab is told of the member: the Employee picked, which only
		// the Member Dashboard's own roles may name (see PAGE_ROLES in
		// member_dashboard.py)
		member_args() {
			return { member: this.member };
		}

		// a tab's note when get_tab finds no such Employee
		not_found_note() {
			return __("Member {0} not found.", [this.member]);
		}

		// a member asked for by the route or the URL is read (see
		// apply_prefill). otherwise, back on the page -- from the Mobile
		// Dashboard a row opened, say, where a job may have been closed or
		// handed on -- what it lists may be out of date, and is read again
		// quietly. the first show is the page opening, already being read.
		on_show() {
			const reopened = this.shown;
			this.shown = true;
			if (this.apply_prefill()) return;
			if (!this.member) this.member_control.$input.trigger("focus");
			else if (reopened) this.load({ quiet: true });
		}

		// true when the route or the URL asked for a member other than the one
		// on screen, who is then read. the router copies the URL's query string
		// into route_options on every route change, so this covers a refresh
		// and the Back button as well as another page routing here with a
		// member already picked. the URL is read directly too, for a desk that
		// does not.
		apply_prefill() {
			const from_route = frappe.route_options || {};
			frappe.route_options = null;
			const from_url = frappe.utils.get_query_params() || {};
			this.url_ready = true;

			const member = String(from_route.member || from_url.member || "").trim();

			// nothing asked for, or only what is already on screen -- as on Back to
			// this page, whose URL has followed every pick. either way the URL is
			// brought up to date, since arriving from the sidebar clears it.
			if (!member || member === this.member) {
				this.write_url_params();
				return false;
			}

			// read first, so the change the box fires once it has checked the
			// link finds it on screen already. one that is no Employee is emptied
			// by that check, which puts the page back as it opened.
			this.pick_member(member);
			this.member_control.set_value(member);
			return true;
		}

		// the member on screen is kept in the URL as ?member=, so a browser
		// refresh, or a link copied from the address bar, opens on them again.
		// the URL is replaced rather than pushed: a pick is not a navigation, and
		// Back should leave the page rather than step through every member
		// tried. any other query parameter is left as it was.
		write_url_params() {
			// the box can fire its change as it loses focus to a click that
			// leaves the page, and the page then on screen has its own URL
			if (!this.url_ready || (frappe.get_route() || [])[0] !== PAGE_NAME) return;

			const params = new URLSearchParams(window.location.search);
			if (this.member) params.set("member", this.member);
			else params.delete("member");

			const query = params.toString();
			const search = query ? "?" + query : "";
			if (search === window.location.search) return;
			history.replaceState(history.state, "", window.location.pathname + search + window.location.hash);
		}

		/* ------------------------------------------------------------- loading */

		// every tab read afresh: as a member is picked, on Refresh, and quietly
		// whenever the page is shown again (see on_show)
		load({ quiet = false } = {}) {
			TABS.forEach((tab) => this.load_tab(tab.key, { quiet }));
		}

		// one tab read afresh, on what its boxes say. `quiet` keeps what is on
		// screen until the answer replaces it, and leaves it alone if none comes.
		// with no member picked there is nothing to read, and an answer still on
		// its way for the one before is dropped all the same.
		load_tab(key, { quiet = false } = {}) {
			const seq = (this.seqs[key] = (this.seqs[key] || 0) + 1);
			const filters = this.filter_values(key);
			this.asked[key] = JSON.stringify(filters);
			if (!this.member_picked()) {
				this.set_count(key, "");
				this.show_note(key, __("Select a member to begin."));
				return;
			}
			if (!quiet) {
				this.set_count(key, "");
				this.show_note(key, __("Loading..."));
			}

			frappe
				.call({
					method: TAB_METHOD,
					args: Object.assign({ tab: key }, filters, this.member_args()),
				})
				.then((r) => {
					if (seq !== this.seqs[key]) return;
					const message = (r && r.message) || {};
					this.set_member(message);
					if (!message.employee) {
						this.set_count(key, "");
						this.show_note(key, this.not_found_note());
						return;
					}
					this.set_tab(key, message);
				})
				.catch((error) => {
					if (seq !== this.seqs[key]) return;
					if (quiet) {
						console.error(error);
						return;
					}
					this.show_note(key, __("Could not load this list."), true);
				});
		}

		// the member's name on the bar. every answer says who the member is --
		// on the Member Self Dashboard only the server knows -- and the
		// Employee ID is kept for the name's tooltip.
		set_member({ employee, employee_name }) {
			this.show_member_name(employee ? employee_name : "—", employee);
		}

		show_member_name(text, employee) {
			this.$el
				.find(".logicx-mbd-member-name")
				.text(text)
				.attr("title", employee || null);
		}

		/* ------------------------------------------------------------- filters */

		// the boxes above each tab's table (see TABS). a change reads that one
		// tab again -- the others have not moved -- once the box has settled on
		// a value: a Link once it has checked what was picked, a Select as it is
		// picked, a Check as it is ticked.
		setup_filters() {
			this.controls = {};
			// what each tab was last read for, kept so a Link that fires its
			// change again for the same pick does not read the tab twice (see
			// on_filter_change)
			this.asked = {};
			TABS.forEach((tab) => {
				this.controls[tab.key] = {};
				tab.filters.forEach((filter) => {
					this.controls[tab.key][filter.key] = frappe.ui.form.make_control({
						parent: this.$el.find(`[data-pane="${tab.key}"] [data-filter="${filter.key}"]`),
						df: {
							fieldname: `${filter.key}_${tab.key}`,
							label: filter.label,
							// a box's label is off-screen, so the field names itself
							// here; a Check keeps its own beside it
							placeholder: filter.label,
							fieldtype: filter.fieldtype,
							options: filter.options,
							change: () => this.on_filter_change(tab.key),
						},
						render_input: true,
					});
					if (filter.options_from) this.load_options(tab.key, filter);
				});
			});
		}

		// a Select's options, read off the field `options_from` names, so one
		// added there is offered here too
		load_options(key, filter) {
			const [doctype, fieldname] = filter.options_from;
			frappe.model.with_doctype(doctype, () => {
				const field = frappe.meta.get_docfield(doctype, fieldname);
				const options = String((field && field.options) || "")
					.split("\n")
					.filter(Boolean);
				const control = this.controls[key][filter.key];
				control.df.options = ["", ...options];
				control.set_input(control.value || "");
			});
		}

		on_filter_change(key) {
			if (JSON.stringify(this.filter_values(key)) !== this.asked[key]) this.load_tab(key);
		}

		// what a tab's boxes say, as get_tab is asked by them: a Check 1 or 0,
		// any other the value it last settled on -- so a Link still being typed
		// in is read as it was before -- or "" for none
		filter_values(key) {
			const values = {};
			TABS.find((tab) => tab.key === key).filters.forEach((filter) => {
				const value = this.controls[key][filter.key].value;
				values[filter.key] = filter.fieldtype === "Check" ? (value ? 1 : 0) : String(value || "").trim();
			});
			return values;
		}

		/* ---------------------------------------------------------------- tabs */

		setup_events() {
			this.$el.on("click", ".logicx-mbd-tab", (e) => {
				this.activate_tab($(e.currentTarget).attr("data-tab"));
			});

			// a click on a row opens what its tab opens (see TABS) -- in a new
			// browser tab with Ctrl / Cmd held, as a link would. only body rows
			// carry a row index: the header and the inline filter row above them
			// are the table's own.
			this.$el.on("click", ".logicx-mbd-card-body .dt-row[data-row-index]", (e) => {
				const $row = $(e.currentTarget);
				this.open_row(
					$row.closest("[data-pane]").attr("data-pane"),
					Number($row.attr("data-row-index")),
					e.ctrlKey || e.metaKey
				);
			});

			this.$el.on("click", ".logicx-mbd-refresh", () => this.load());
		}

		activate_tab(key) {
			if (!key || key === this.active_tab) return;
			this.active_tab = key;

			this.$el.find(".logicx-mbd-tab").each(function () {
				$(this).toggleClass("is-active", $(this).attr("data-tab") === key);
			});
			this.$el.find(".logicx-mbd-tabpane").each(function () {
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
			const row = result && result.rendered ? result.rows[index] : null;
			if (tab && row) tab.open(row, in_new_tab);
		}

		/* -------------------------------------------------------------- tables */

		// hand a tab its rows: count them on its tab, remember them, and build
		// the table now only if that tab is the one on screen. the same rows as
		// the table already shows leave it as it is, sorted and searched as it
		// was left -- which is how the quiet read on every show mostly comes back.
		set_tab(key, { rows = [], more = false }) {
			// "500+" when the server stopped short of the rest (see ROW_LIMIT in
			// member_dashboard.py)
			this.set_count(key, more ? `${rows.length}+` : String(rows.length));

			const json = JSON.stringify(rows);
			const shown = this.results[key];
			if (shown && shown.rendered && shown.json === json) return;

			this.results[key] = { rows, json };
			if (key === this.active_tab) this.render_tab(key);
		}

		set_count(key, text) {
			this.$el
				.find(`.logicx-mbd-tab[data-tab="${key}"] .logicx-mbd-count`)
				.text(text)
				.toggleClass("hidden", !text);
		}

		// called both when a result lands and when its tab is opened, whichever
		// comes second; `rendered` is what keeps it from building twice
		render_tab(key) {
			const result = this.results[key];
			if (!result || result.rendered) return;
			result.rendered = true;

			if (!result.rows.length) {
				this.show_note(key, __("No records"));
				return;
			}

			this.datatable_ready.then(() => {
				// the tab may have been read again while the bundle loaded
				if (this.results[key] !== result) return;
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
				columns: fit_columns(tab.columns, $body.get(0).clientWidth).map(to_datatable_column),
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
			return this.$el.find(`[data-pane="${key}"] .logicx-mbd-card-body`);
		}

		// the muted line a tab shows in place of its table: while loading, when
		// empty, or in red when the request failed. the rows a click on the
		// table was looked up in go with it.
		show_note(key, text, is_error) {
			this.destroy_table(key);
			this.results[key] = null;
			this.$card_body(key).html(note_html(text, is_error));
		}
	}

	// the Member Dashboard on the member looking at it: the Employee linked to
	// the logged-in User. there is no box to pick one in, and nothing is kept in
	// the URL -- get_tab is told of no member, and answers for the one logged in.
	class MemberSelfDashboard extends MemberDashboard {
		title() {
			return __("Member Self Dashboard");
		}

		// "Member : <name>", filled in once the first tab has answered (see
		// set_member)
		render_member() {
			return `
				<div class="logicx-mbd-member">
					<span class="logicx-mbd-member-label">${__("Member")} :</span>
					<span class="logicx-mbd-member-name"></span>
				</div>`;
		}

		setup_member() {}

		// always: the one logged in
		member_picked() {
			return true;
		}

		member_args() {
			return {};
		}

		not_found_note() {
			return __("No Employee is linked to your user {0}.", [frappe.session.user]);
		}

		// back on the page -- from the Mobile Dashboard a row opened, say, where
		// a job may have been closed or handed on, or a Duty assigned -- so what
		// it lists may be out of date. the first show is the page opening,
		// already being read.
		on_show() {
			if (this.shown) this.load({ quiet: true });
			this.shown = true;
		}
	}

	// handed to the pages, which read them once the page's whole script has run
	frappe.provide("logicx_biz.member_dashboard");
	logicx_biz.member_dashboard.MemberDashboard = MemberDashboard;
	logicx_biz.member_dashboard.MemberSelfDashboard = MemberSelfDashboard;

	/* ====================================================================== rows */

	// a Jobs or Leads row is an Enquiry: the Mobile Dashboard on its Mobile. an
	// Enquiry with no Mobile -- one from before Mobile was mandatory -- has no
	// Mobile Dashboard to open, and opens itself instead.
	function open_enquiry(row, in_new_tab) {
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

	// a Duty row is one SOP of the member's: the Duty Reporting list on what
	// they have reported against it, filtered by both -- their Employee as User,
	// and the SOP. route_options cannot ride along into a fresh document, so a
	// new browser tab is sent them as ?user=&sop=, which the list reads too.
	// either way the list's own default filter, on the logged-in user's
	// Employee, stands aside for the User asked for (see
	// public/js/user_employee_default_filter.js).
	function open_duty_reporting(row, in_new_tab) {
		const filters = { user: row.user, sop: row.sop };
		if (in_new_tab) {
			const list_url = frappe.router.make_url([frappe.router.slug(DUTY_REPORTING)]);
			window.open(`${list_url}?${new URLSearchParams(filters)}`, "_blank");
			return;
		}
		frappe.set_route("List", DUTY_REPORTING, filters);
	}

	/* ==================================================================== markup */

	// the member at the left of the bar (see render_member), and Refresh at
	// its right end
	function render_scaffold(member_html) {
		return `
			<div class="logicx-mbd-bar">
				${member_html}
				<button type="button" class="btn btn-default btn-sm logicx-mbd-refresh">
					${__("Refresh")}
				</button>
			</div>
			${render_tabcard()}
		`;
	}

	// each tab carries a count of its rows once they are in (see set_tab), and
	// its pane its boxes above the table (see setup_filters)
	function render_tabcard() {
		const buttons = TABS.map(
			(tab, i) => `
			<button type="button" class="logicx-mbd-tab${i === 0 ? " is-active" : ""}"
				data-tab="${tab.key}">
				${frappe.utils.escape_html(tab.title)}
				<span class="logicx-mbd-count hidden"></span>
			</button>`
		).join("");

		const panes = TABS.map(
			(tab, i) => `
			<div class="logicx-mbd-tabpane${i === 0 ? "" : " hidden"}" data-pane="${tab.key}">
				<div class="logicx-mbd-filters">${render_filters(tab)}</div>
				<div class="logicx-mbd-card-body"></div>
			</div>`
		).join("");

		return `
			<div class="logicx-mbd-tabcard">
				<div class="logicx-mbd-tabnav">${buttons}</div>
				${panes}
			</div>`;
	}

	// a place for each of the tab's boxes; a Link or Select is a box that reads
	// from its placeholder, a Check keeps its label beside it
	function render_filters(tab) {
		return tab.filters
			.map(
				(filter) => `
				<div class="logicx-mbd-filter${filter.fieldtype === "Check" ? "" : " is-box"}"
					data-filter="${filter.key}"></div>`
			)
			.join("");
	}

	function note_html(text, is_error) {
		const css_class = is_error ? "logicx-mbd-note is-error" : "logicx-mbd-note";
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
	// into the Enquiries and SOPs they come from
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
		.logicx-mbd {
			display: flex;
			flex-direction: column;
			gap: var(--margin-sm);
			padding: var(--padding-sm) var(--padding-md) var(--padding-lg);
		}

		/* the member at the left, Refresh pushed to the right end */
		.logicx-mbd-bar {
			display: flex;
			align-items: center;
			gap: var(--margin-md);
			padding: var(--padding-md) 0 var(--padding-xs);
		}

		/* the Member Dashboard's box, as wide as the Customer Dashboard's: it
		   gives way on a narrow screen only as far as an Employee ID still
		   reads */
		.logicx-mbd-search {
			flex: 0 1 280px;
			min-width: 180px;
		}

		/* frappe's control markup ships its own bottom margin and an empty help
		   line under the box; neither has anything to space here */
		.logicx-mbd-search .frappe-control,
		.logicx-mbd-search .form-group {
			margin-bottom: 0;
		}

		.logicx-mbd-search .help-box {
			display: none;
		}

		/* the member box, and a tab's Link or Select, read plainly from their
		   placeholders, so their labels are dropped from the layout. they stay
		   in the markup, off-screen, so each input keeps an accessible name. */
		.logicx-mbd-search .control-label,
		.logicx-mbd-filter.is-box .control-label {
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

		/* one line, cut short with an ellipsis on a narrow screen rather than
		   pushing Refresh off the bar */
		.logicx-mbd-member {
			flex: 1 1 auto;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: var(--text-lg);
			color: var(--text-color);
		}

		.logicx-mbd-member-label {
			color: var(--text-muted);
		}

		.logicx-mbd-member-name {
			font-weight: 600;
		}

		.logicx-mbd-refresh {
			flex: 0 0 auto;
		}

		.logicx-mbd-tabnav {
			display: flex;
			flex-wrap: wrap;
			gap: var(--margin-lg);
			border-bottom: 1px solid var(--border-color);
		}

		.logicx-mbd-tab {
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

		.logicx-mbd-tab:hover {
			color: var(--text-color);
		}

		.logicx-mbd-tab.is-active {
			color: var(--text-color);
			border-bottom-color: var(--primary, var(--text-color));
		}

		.logicx-mbd-count {
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
		.logicx-mbd-count.hidden,
		.logicx-mbd-tabpane.hidden {
			display: none;
		}

		.logicx-mbd-tabpane {
			padding-top: var(--padding-md);
		}

		/* a tab's boxes, just above its table, in a row that wraps on a narrow
		   screen. frappe's control markup ships its own margins and an empty
		   help line, which have nothing to space here: the row's own padding
		   and gap do that. */
		.logicx-mbd-filters {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--margin-sm) var(--margin-md);
			padding-bottom: var(--padding-sm);
		}

		.logicx-mbd-filters .frappe-control,
		.logicx-mbd-filters .form-group,
		.logicx-mbd-filters .checkbox {
			margin: 0;
		}

		.logicx-mbd-filters .help-box {
			display: none;
		}

		/* a Link or Select, wide enough for a Department's name */
		.logicx-mbd-filter.is-box {
			flex: 0 1 220px;
			min-width: 160px;
		}

		/* the datatable brings its own padding, so its body has none, and is
		   clipped to the outline it is read inside */
		.logicx-mbd-card-body {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
			overflow: hidden;
		}

		.logicx-mbd-card-body .datatable {
			border: none;
		}

		/* every body row opens what its tab opens (see open_row) */
		.logicx-mbd-card-body .dt-row[data-row-index] {
			cursor: pointer;
		}

		.logicx-mbd-card-body .dt-row[data-row-index]:hover .dt-cell {
			background-color: var(--fg-hover-color, var(--gray-100));
		}

		/* the list's scroll box, sized as on the Mobile Dashboard */
		.logicx-mbd-card-body .dt-scrollable {
			max-height: 33333px !important;
			overflow-y: auto !important;
		}

		.logicx-mbd-note {
			padding: var(--padding-lg);
			font-size: var(--text-md);
			color: var(--text-muted);
			text-align: center;
		}

		.logicx-mbd-note.is-error {
			color: var(--red-500);
		}
	`;
})();
