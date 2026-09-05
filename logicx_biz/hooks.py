app_name = "logicx_biz"
app_title = "LogicX Biz"
app_publisher = "LogicX"
app_description = "LogicX extensions that power business workflows."
app_email = "ashok@logicx.in"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "logicx_biz",
# 		"logo": "/assets/logicx_biz/logo.png",
# 		"title": "LogicX Biz",
# 		"route": "/logicx_biz"
# 	}
# ]

# website_redirects = [
# 	{
# 		"source": "/logicx_biz",
# 		"target": "/desk/logicx-hr-home"
# 	}
# ]

# public item lookup page (logicx_biz/www/product.py);
# also reachable as /product?item_id=<id>
website_route_rules = [
	{"from_route": "/product/<item_id>", "to_route": "product"},
]

# FRAPPE BUILDER
# bench --site tmnext.in export-fixtures -- DEV: from site - export into app.
# bench --site tmnext.in migrate         -- PROD: from app - update to site.
fixtures = [
	{"doctype": "Role", "filters": [
									["name", "in", ["TM Admin", "TM Accounts", "TM User"]],
									]},
	{"doctype": "Custom Field", "filters": [
											["name", "in", [
															"Employee-cost_per_hour",
															"Item-crate",
															"Batch-pricing_section",
															"Batch-mrp",
															"Batch-mop",
															"Batch-pricing_column",
															"Batch-min_selling_price",
															"Batch-max_selling_price",
															"Batch-vendor",
															]],
											]},
	# Batch.supplier is a standard ERPNext field, so its overrides (editable
	# instead of read-only, plus the description telling it apart from the
	# custom Batch.vendor) go in as Property Setters rather than Custom Fields.
	{"doctype": "Property Setter", "filters": [
											["name", "in", [
															"Batch-supplier-read_only",
															"Batch-supplier-description",
															]],
											]},
	# {"doctype": "Builder Page", "filters": [["name", "in", ["my-page-1", "my-page-2"]]]},
]


# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = [
	"/assets/logicx_biz/css/logicx_item_view_1.css",
	"/assets/logicx_biz/css/logicx_item_view_2.css",
]
# LogicX views (custom list view types) — must load at desk boot so the
# "logicx-item-1" / "logicx-item-2" routes resolve and the view classes exist before routing
app_include_js = [
	"/assets/logicx_biz/js/logicx_item_view_1.js",
	"/assets/logicx_biz/js/logicx_item_view_2.js",
]

# include js, css files in header of web template
# web_include_css = "/assets/logicx_biz/css/logicx_biz.css"
# web_include_js = "/assets/logicx_biz/js/logicx_biz.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "logicx_biz/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	"Customer": "public/js/customer.js",
}
doctype_list_js = {
	"Enquiry": "public/js/user_employee_default_filter.js",
	"Notice": "public/js/user_employee_default_filter.js",
	"Staff Request": "public/js/user_employee_default_filter.js",
	"SOP Assigned": "public/js/user_employee_default_filter.js",
	"SOP Reporting": "public/js/user_employee_default_filter.js",
}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "logicx_biz/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "logicx_biz.utils.jinja_methods",
# 	"filters": "logicx_biz.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "logicx_biz.install.before_install"
after_install = ["logicx_biz.desk_fixes.cleanup_shadow_sidebars"]

# Desk / Workspace Sidebar
# ------------------------
# Frappe v16 auto-generates workspace sidebars (saved per-workspace records on
# every app install, per-module docs cached in-process) that shadow this app's
# standard sidebars. See logicx_biz/desk_fixes.py.
extend_bootinfo = "logicx_biz.desk_fixes.extend_bootinfo"
after_migrate = ["logicx_biz.desk_fixes.cleanup_shadow_sidebars"]

# Uninstallation
# ------------

# before_uninstall = "logicx_biz.uninstall.before_uninstall"
# after_uninstall = "logicx_biz.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "logicx_biz.utils.before_app_install"
# frappe's own after_app_install hook recreates shadow sidebars on every app
# install; this one runs after it and removes them again
after_app_install = ["logicx_biz.desk_fixes.cleanup_shadow_sidebars"]

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "logicx_biz.utils.before_app_uninstall"
# after_app_uninstall = "logicx_biz.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "logicx_biz.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	# mobile numbers on parties must be exactly 10 digits (see mobile_validation.py)
	"Address": {"validate": "logicx_biz.logicx_erp.mobile_validation.validate_party_mobile"},
	"Contact": {"validate": "logicx_biz.logicx_erp.mobile_validation.validate_party_mobile"},
	"Customer": {"validate": "logicx_biz.logicx_erp.mobile_validation.validate_party_mobile"},
	"Supplier": {"validate": "logicx_biz.logicx_erp.mobile_validation.validate_party_mobile"},
	# Batch.vendor is read-only, so it is stamped from the voucher that created
	# the batch (see batch.py)
	"Batch": {"before_insert": "logicx_biz.logicx_erp.batch.set_vendor"},
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"logicx_biz.tasks.all"
# 	],
# 	"daily": [
# 		"logicx_biz.tasks.daily"
# 	],
# 	"hourly": [
# 		"logicx_biz.tasks.hourly"
# 	],
# 	"weekly": [
# 		"logicx_biz.tasks.weekly"
# 	],
# 	"monthly": [
# 		"logicx_biz.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "logicx_biz.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "logicx_biz.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "logicx_biz.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "logicx_biz.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["logicx_biz.utils.before_request"]
# after_request = ["logicx_biz.utils.after_request"]

# Job Events
# ----------
# before_job = ["logicx_biz.utils.before_job"]
# after_job = ["logicx_biz.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"logicx_biz.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []
