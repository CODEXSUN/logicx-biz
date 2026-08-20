const EMPLOYEE_FILTER_FIELD_BY_DOCTYPE = {
	"Enquiry": "assigned_to_employee",
	"Notice": "employee",
	"Staff Request": "employee",
	"SOP Assigned": "user",
	"SOP Reporting": "user",
};

frappe.listview_settings = frappe.listview_settings || {};

function route_has_field_filter(fieldname) {
	const route_options = frappe.route_options;
	if (!route_options) {
		return false;
	}

	if (Array.isArray(route_options)) {
		return route_options.some((item) => {
			if (Array.isArray(item)) {
				if (item.length >= 4) {
					return item[1] === fieldname;
				}
				if (item.length >= 3) {
					return item[0] === fieldname;
				}
			}

			return item?.fieldname === fieldname;
		});
	}

	return Object.prototype.hasOwnProperty.call(route_options, fieldname);
}

function list_has_field_filter(listview, fieldname) {
	const active_filters = listview.filter_area?.get?.() || [];
	return active_filters.some((item) => {
		if (Array.isArray(item)) {
			if (item.length >= 4) {
				return item[1] === fieldname;
			}
			if (item.length >= 3) {
				return item[0] === fieldname;
			}
		}

		return item?.fieldname === fieldname;
	});
}

async function get_current_employee() {
	const response = await frappe.db.get_value(
		"Employee",
		{ user_id: frappe.session.user },
		"name"
	);

	return response?.message?.name || null;
}

async function apply_default_employee_filter(listview) {
	const fieldname = EMPLOYEE_FILTER_FIELD_BY_DOCTYPE[listview.doctype];
	if (!fieldname) {
		return;
	}

	if (route_has_field_filter(fieldname) || list_has_field_filter(listview, fieldname)) {
		return;
	}

	const employee = await get_current_employee();
	if (!employee) {
		return;
	}

	listview.filter_area?.add?.([[listview.doctype, fieldname, "=", employee]]);
}

Object.keys(EMPLOYEE_FILTER_FIELD_BY_DOCTYPE).forEach((doctype) => {
	frappe.listview_settings[doctype] = frappe.listview_settings[doctype] || {};

	const existing_onload = frappe.listview_settings[doctype].onload;
	frappe.listview_settings[doctype].onload = async function (listview) {
		if (existing_onload) {
			await existing_onload(listview);
		}

		await apply_default_employee_filter(listview);
	};
});
