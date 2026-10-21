// The Activity button on the job forms: Enquiry, SOP Item, Customer and Supplier. Its menu opens
// the Job Activity, Job Comments, Job Estimate, Job Execution, Job Location or Job Attachment list
// on the record: Job Type = the form's doctype, Job ID = the record's name
// (see logicx_hr/doctype/job_type/DESIGN.md).
//
// Loaded from app_include_js rather than from each form's own script, because Customer and
// Supplier are ERPNext's forms: one refresh handler, registered at desk boot, serves all four.

// the forms that get the button: every default Job Type but Task. A Job Type is named after its
// DocType, so the form's doctype is the Job Type to filter on
const JOB_ACTIVITY_MENU_JOB_TYPES = ["Enquiry", "SOP Item", "Customer", "Supplier"];

// the menu, top to bottom: the doctypes that name their job through job_type + job_id
const JOB_ACTIVITY_MENU_ITEMS = [
	"Job Activity",
	"Job Comments",
	"Job Estimate",
	"Job Execution",
	"Job Location",
	"Job Attachment",
];

JOB_ACTIVITY_MENU_JOB_TYPES.forEach((job_type) => {
	frappe.ui.form.on(job_type, { refresh: add_job_activity_menu });
});

function add_job_activity_menu(frm) {
	// an unsaved record has no name to filter on yet
	if (frm.is_new()) {
		return;
	}
	// only the lists the user can read; with none, there is no Activity button at all
	const doctypes = JOB_ACTIVITY_MENU_ITEMS.filter((doctype) => frappe.model.can_read(doctype));
	for (const doctype of doctypes) {
		frm.add_custom_button(
			__(doctype),
			() => {
				frappe.set_route("List", doctype, { job_type: frm.doctype, job_id: frm.doc.name });
			},
			__("Activity")
		);
	}
}
