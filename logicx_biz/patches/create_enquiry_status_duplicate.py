"""Add the "Duplicate" Enquiry Status, in the "Closed" group.

For an Enquiry that repeats one already logged. Being in the Closed group, the Member Dashboard
leaves it out until "Show Closed" is ticked, and the status reports count it under Closed.

create_enquiry_statuses lists it now, last, but that patch has run on existing sites already, so
it is made here. idx 0 sorts it after the statuses seeded there (idx 11 down to 1), last as in
that list. A no-op when it is there already.
"""

from logicx_biz.patches.create_enquiry_statuses import create_status


def execute():
	create_status("Duplicate", "Closed", idx=0)
