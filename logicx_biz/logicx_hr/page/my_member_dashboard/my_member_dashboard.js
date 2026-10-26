// My Member Dashboard: the Member Dashboard on the member looking at it, the
// Employee linked to the logged-in User. The dashboard itself is in
// member_dashboard/member_dashboard_view/, which hooks.py's page_js appends to
// this script; its class is read from on_page_load on.
(function () {
	const PAGE_NAME = "my-member-dashboard";

	frappe.provide("logicx_biz.member_dashboard");

	// held across on_page_load / on_page_show, which frappe calls separately
	let dashboard = null;

	frappe.pages[PAGE_NAME].on_page_load = function (wrapper) {
		const MyMemberDashboard = logicx_biz.member_dashboard.MyMemberDashboard;
		if (!MyMemberDashboard) {
			frappe.msgprint(
				__(
					"My Member Dashboard's script did not load. It is listed in hooks.py's page_js under my-member-dashboard; after a change there, clear the site's cache."
				)
			);
			return;
		}
		dashboard = new MyMemberDashboard(wrapper);
	};

	frappe.pages[PAGE_NAME].on_page_show = function () {
		if (dashboard) dashboard.on_show();
	};
})();
