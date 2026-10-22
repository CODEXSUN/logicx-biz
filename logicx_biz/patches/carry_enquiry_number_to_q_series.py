"""Carry the Enquiry number over from the "ENQ" counter to the "Q" one.

Enquiry is now named Q.# (Q1, Q2, ...) instead of ENQ.# (ENQ1, ENQ2, ...). Frappe keeps one
counter per prefix in `tabSeries`, so on its own the new prefix would start again at Q1. Instead
the "Q" counter is set to the highest number used so far, so numbering carries on: after ENQ57
comes Q58.

"Highest" is taken over the "ENQ" counter, the "Q" counter (should something already use it) and
the numbers in the existing Enquiry names, ENQ<n> or Q<n> (should the counter have been lowered or
an Enquiry renamed). The counter is only ever raised, never lowered, so running it again is safe.
Existing Enquiries keep their names; the "ENQ" counter is left as it is.

Runs before the sync (pre_model_sync), so the counter is in place by the time Enquiry turns to Q.#.
"""

import re

import frappe
from frappe.model.naming import NamingSeries

OLD_SERIES = NamingSeries("ENQ.#")
NEW_SERIES = NamingSeries("Q.#")

# ENQ57 or Q58: the names either series gives
NAME_NUMBER = re.compile(r"(?:ENQ|Q)(\d+)")


def execute():
	old_count = OLD_SERIES.get_current_value()
	new_count = NEW_SERIES.get_current_value()
	highest_name = highest_name_number()

	count = max(old_count, new_count, highest_name)
	if count > new_count:
		NEW_SERIES.update_counter(count)

	print(
		f"Enquiry: Q counter={count} (was {new_count}), ENQ counter={old_count}, "
		f"highest name number={highest_name}, next Enquiry=Q{count + 1}"
	)


def highest_name_number():
	highest = 0
	for name in frappe.get_all("Enquiry", pluck="name"):
		if match := NAME_NUMBER.fullmatch(name):
			highest = max(highest, int(match.group(1)))
	return highest
