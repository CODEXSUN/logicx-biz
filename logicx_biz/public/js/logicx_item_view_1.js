// LogicX Item View 1 — a custom list view type (like Report View / Image View).
// Available for the doctypes in LOGICX_ITEM_VIEW_1_SPECS via the list view switcher,
// or directly at /app/<doctype>/view/logicx-item-1.
//
// It still extends frappe.views.ListView (so filters, sorting, paging, count and
// realtime refresh keep working), but the row/column rendering is discarded
// entirely: setup_columns/render_header are neutralized and render_list() paints
// an HTML micro-template (jinja-style {% %} / {{ }} delimiters, JS statements —
// rendered client-side by frappe.render_template) over this.data.

frappe.provide("frappe.views");
frappe.provide("frappe.views.logicx_views");

// the "logicx-item-1" route piece resolves to the standard route
// ["List", <doctype>, "Logicx-Item-1"], which makes frappe.views.ListFactory
// instantiate frappe.views.LogicxItem1View
frappe.router.list_views.push("logicx-item-1");
frappe.router.list_views_route["logicx-item-1"] = "Logicx-Item-1";

const LOGICX_ITEM_VIEW_1_SPECS = {
	Item: {
		// subject links to the doc and shows doc.name (= item code)
		subject_label: "Item Code",
		fields: [
			"item_name",
			"custom_print_name",
			"item_group",
			"brand",
			"gst_hsn_code",
			"description",
		],
	},
};

// registry of LogicX view types shared with the switcher wiring below;
// logicx_item_view_2.js adds its own entry (load order doesn't matter — the
// switcher reads the registry at setup time, not at load time)
frappe.views.logicx_views.LogicxItem1 = {
	route: "logicx-item-1",
	label: __("LogicX Item View 1"),
	applies: (doctype) => Boolean(LOGICX_ITEM_VIEW_1_SPECS[doctype]),
};

// rendered with frappe.render_template — {% %} takes JS statements, {{ }} outputs
// raw HTML, so every value in the context is pre-escaped or pre-formatted
const LOGICX_LIST_TEMPLATE = `
<div class="logicx-list">
	<div class="logicx-list-meta text-muted">
		<span class="list-count"></span>
	</div>
	{% for (const row of rows) { %}
	<div class="logicx-list-row" data-name="{{ row.title }}">
		<div class="logicx-list-subject">
			<span class="logicx-field-label text-muted">{{ subject_label }}</span>
			<a class="logicx-list-title" href="{{ row.route }}">{{ row.title }}</a>
		</div>
		<div class="logicx-list-fields">
			{% for (const field of row.fields) { %}
			<div class="logicx-list-field">
				<span class="logicx-field-label text-muted">{{ field.label }}</span>
				<span class="logicx-field-value">{{ field.html }}</span>
			</div>
			{% } %}
		</div>
	</div>
	{% } %}
</div>
`;

frappe.views.LogicxItem1View = class LogicxItem1View extends frappe.views.ListView {
	get view_name() {
		return "LogicxItem1";
	}

	get logicx_spec() {
		return LOGICX_ITEM_VIEW_1_SPECS[this.doctype] || { fields: [] };
	}

	get_logicx_docfields() {
		return this.logicx_spec.fields
			.map((fieldname) => frappe.meta.get_docfield(this.doctype, fieldname))
			.filter(Boolean);
	}

	// extending this (instead of set_fields) sends the extra fields through the
	// core pipeline that also fetches link title fields and currency options
	get_fields_in_list_view() {
		const fields = super.get_fields_in_list_view();
		const present = new Set(fields.map((df) => df.fieldname));
		return fields.concat(this.get_logicx_docfields().filter((df) => !present.has(df.fieldname)));
	}

	// ---- row/column rendering discarded from here on ----

	setup_columns() {
		this.columns = [];
	}

	render_header() {
		// no column header — the template carries its own .list-count element,
		// which keeps render_count() and freeze() working
	}

	render_skeleton() {
		// skeleton row markup assumes list columns
	}

	render_list() {
		this.$result.html(frappe.render_template(LOGICX_LIST_TEMPLATE, this.get_template_context()));
	}

	// realtime updates re-render through render_list(), but the "doc no longer
	// matches filters" path calls this instead — re-render from this.data
	remove_list_items() {
		this.render_list();
	}

	get_template_context() {
		const docfields = this.get_logicx_docfields();
		const rows = this.data.map((doc) => ({
			title: frappe.utils.escape_html(doc.name),
			route: frappe.utils.get_form_link(this.doctype, doc.name),
			fields: docfields
				.filter((df) => doc[df.fieldname] != null && doc[df.fieldname] !== "")
				.map((df) => ({
					label: frappe.utils.escape_html(__(df.label, null, df.parent)),
					html: frappe.format(doc[df.fieldname], df, { inline: true }, doc),
				})),
		}));
		return {
			subject_label: frappe.utils.escape_html(__(this.logicx_spec.subject_label || "ID")),
			rows,
		};
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

// add the registered LogicX views to the view switcher dropdown of the doctypes
// they apply to; they are deliberately NOT pushed into frappe.views.view_modes —
// core ListViewSelect.setup_views() would crash on an unknown mode for every doctype
frappe.views.ListViewSelect = class LogicxListViewSelect extends frappe.views.ListViewSelect {
	set_current_view() {
		super.set_current_view();
		const route = frappe.get_route();
		const view_name = frappe.utils.to_title_case(route[2] || "");
		if (route.length > 2 && frappe.views.logicx_views[view_name]) {
			this.current_view = view_name;
		}
	}

	setup_views() {
		const labels = {};
		for (const [view_name, spec] of Object.entries(frappe.views.logicx_views)) {
			labels[view_name] = spec.label;
		}
		this.label_map = Object.assign(labels, this.label_map);
		super.setup_views();
		for (const [view_name, spec] of Object.entries(frappe.views.logicx_views)) {
			if (spec.applies(this.doctype) && this.current_view !== view_name) {
				this.add_view_to_menu(view_name, () => this.set_route(spec.route));
			}
		}
	}
};
