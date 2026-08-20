frappe.pages["dashboard"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Dashboard"),
		single_column: true,
	});
};
