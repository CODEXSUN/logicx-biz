"""Seed the default "Job Activity Type" masters.

A Job Activity says which record posted it through Job Activity Type + Job Activity ID (a
Dynamic Link): the Job Comments, Job Execution, Job Location, Job Estimate or Job Attachment
row whose save posted it. A Job Activity Type is named after the DocType it stands for, as
the Dynamic Link reads its value as the DocType of Job Activity ID.

`idx` is set in descending order, as in create_job_types, so the list view keeps the order
listed here.
"""

import frappe

DEFAULT_JOB_ACTIVITY_TYPES = ["Job Comments", "Job Execution", "Job Location", "Job Estimate", "Job Attachment"]


def execute():
	total = len(DEFAULT_JOB_ACTIVITY_TYPES)
	for position, document_type in enumerate(DEFAULT_JOB_ACTIVITY_TYPES):
		create_job_activity_type(document_type, idx=total - position)


def create_job_activity_type(document_type, idx):
	if frappe.db.exists("Job Activity Type", document_type):
		return
	#
	job_activity_type_doc = frappe.new_doc("Job Activity Type")
	job_activity_type_doc.document_type = document_type
	job_activity_type_doc.idx = idx
	job_activity_type_doc.insert(ignore_permissions=True)
