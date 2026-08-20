// LogicX Item View 2 — a custom view for Item built on frappe.views.BaseList.
// BaseList (unlike ListView) has no row/column machinery at all: it provides the
// page chrome (filters, sort selector, paging, view switcher) and fetched data,
// and leaves render() entirely to us — we paint a card grid straight from this.data.
// Available at /app/item/view/logicx-item-2 and via the list view switcher.

frappe.provide("frappe.views");
frappe.provide("frappe.views.logicx_views");

// the "logicx-item-2" route piece resolves to ["List", "Item", "Logicx-Item-2"];
// the mapped value's lowercase must equal the route piece, otherwise
// router.get_standard_route_for_list() re-routes in a loop. ListFactory then
// title-cases it to "LogicxItem2" and instantiates frappe.views.LogicxItem2View.
frappe.router.list_views.push("logicx-item-2");
frappe.router.list_views_route["logicx-item-2"] = "Logicx-Item-2";

// register in the LogicX view switcher (menu wiring lives in logicx_item_view_1.js)
frappe.views.logicx_views.LogicxItem2 = {
	route: "logicx-item-2",
	label: __("LogicX Item View 2"),
	applies: (doctype) => doctype === "Item",
};

const LOGICX_ITEM_VIEW_2_FIELDS = [
	"item_name",
	"custom_print_name",
	"item_group",
	"brand",
	"gst_hsn_code",
	"description",
	"image",
];

frappe.views.LogicxItem2View = class LogicxItem2View extends frappe.views.BaseList {
	get view_name() {
		return "LogicxItem2";
	}

	setup_defaults() {
		super.setup_defaults();
		// "List" opts into the scrollable .result-container and height management
		// (see BaseList.setup_result_container_area / set_result_height)
		this.view = "List";
	}

	check_permissions() {
		// BaseList doesn't check read perm (ListView does) — mirror it
		if (!frappe.perm.has_perm(this.doctype, 0, "read")) {
			frappe.set_route("");
			frappe.throw(__("Not permitted to view {0}", [this.doctype]));
		}
	}

	async set_fields() {
		await super.set_fields();
		// _add_field silently skips fields missing from meta (e.g. custom_print_name on a site without that custom field)
		LOGICX_ITEM_VIEW_2_FIELDS.forEach((fieldname) => this._add_field(fieldname));
	}

	before_render() {
		frappe.model.user_settings.save(this.doctype, "last_view", this.view_name);
	}

	render() {
		const $grid = $('<div class="logicx-item-grid"></div>');
		this.data.forEach((doc) => $grid.append(this.get_card_html(doc)));
		this.$result.html($grid);
	}

	get_card_html(doc) {
		const esc = frappe.utils.escape_html;
		const df = (fieldname) => frappe.meta.get_docfield(this.doctype, fieldname);

		const image = doc.image
			? `<img src="${esc(doc.image)}" alt="${esc(doc.item_name || doc.name)}" loading="lazy">`
			: `<div class="logicx-item-placeholder">${esc(frappe.get_abbr(doc.item_name || doc.name))}</div>`;

		const details = ["item_group", "brand", "gst_hsn_code"]
			.filter((fieldname) => df(fieldname) && doc[fieldname])
			.map(
				(fieldname) => `
					<div class="logicx-item-detail">
						<span class="text-muted">${esc(__(df(fieldname).label))}</span>
						<span>${frappe.format(doc[fieldname], df(fieldname), { inline: true }, doc)}</span>
					</div>`
			)
			.join("");

		return `
			<div class="logicx-item-card" data-name="${esc(doc.name)}">
				<a class="logicx-item-image" href="${frappe.utils.get_form_link(this.doctype, doc.name)}">
					${image}
				</a>
				<div class="logicx-item-body">
					<a class="logicx-item-title ellipsis" href="${frappe.utils.get_form_link(this.doctype, doc.name)}"
						title="${esc(doc.item_name || doc.name)}">
						${esc(doc.item_name || doc.name)}
					</a>
					<div class="logicx-item-code text-muted ellipsis">
						${esc(doc.custom_print_name || doc.name)}
					</div>
					${details}
					${
						doc.description
							? `<div class="logicx-item-description text-muted">
								${esc(frappe.utils.html2text(doc.description).trim().slice(0, 140))}
							</div>`
							: ""
					}
				</div>
			</div>`;
	}

	setup_view_menu() {
		super.setup_view_menu();
		// the switcher button label falls back to "List View" for unknown views
		this.views_menu
			?.closest(".custom-btn-group")
			.find(".custom-btn-group-label")
			.text(frappe.views.logicx_views[this.view_name].label);
	}
};
