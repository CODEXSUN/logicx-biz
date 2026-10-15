"""Seed the default "Job Type" masters.

Job Attachment, Job Comments, Job Estimate, Job Execution and Job Location now say which
job they belong to through Job Type + Job ID (a Dynamic Link) rather than only an Enquiry.
A Job Type is named after the DocType it stands for, as the Dynamic Link reads its value as
the DocType of Job ID.

`idx` is set in descending order because the link-field dropdown and the list view are
ordered by `idx desc`, which keeps the picker in the order listed here. Job Types added
later through the UI get idx 0 and sort last.
"""

import frappe

DEFAULT_JOB_TYPES = ["Enquiry", "SOP Item", "Task", "Customer", "Supplier"]


def execute():
	total = len(DEFAULT_JOB_TYPES)
	for position, document_type in enumerate(DEFAULT_JOB_TYPES):
		create_job_type(document_type, idx=total - position)


def create_job_type(document_type, idx):
	if frappe.db.exists("Job Type", document_type):
		return
	# Task, Customer and Supplier come from ERPNext; a site without the DocType would fail the link check
	if not frappe.db.exists("DocType", document_type):
		print(f"Job Type: skipped {document_type}, no such DocType on this site")
		return
	#
	job_type_doc = frappe.new_doc("Job Type")
	job_type_doc.document_type = document_type
	job_type_doc.idx = idx
	job_type_doc.insert(ignore_permissions=True)
