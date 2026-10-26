// The Member Dashboard, on the member picked in its box (?member=). The
// dashboard itself is in member_dashboard_view/, which hooks.py's page_js
// appends to this script; its class is read from on_page_load on.
(function () {
	const PAGE_NAME = "member-dashboard";

	frappe.provide("logicx_biz.member_dashboard");

	// held across on_page_load / on_page_show, which frappe calls separately
	let dashboard = null;

	frappe.pages[PAGE_NAME].on_page_load = function (wrapper) {
		const MemberDashboard = logicx_biz.member_dashboard.MemberDashboard;
		if (!MemberDashboard) {
			frappe.msgprint(
				__(
					"The Member Dashboard's script did not load. It is listed in hooks.py's page_js under member-dashboard; after a change there, clear the site's cache."
				)
			);
			return;
		}
		dashboard = new MemberDashboard(wrapper);
	};

	frappe.pages[PAGE_NAME].on_page_show = function () {
		if (dashboard) dashboard.on_show();
	};
})();
