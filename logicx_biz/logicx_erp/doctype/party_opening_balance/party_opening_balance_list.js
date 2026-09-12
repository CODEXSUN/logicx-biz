// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

// an opening balance sits on one side of the ledger, so the other side is
// always nil -- shown blank rather than as a 0.00 that reads like a figure
frappe.listview_settings['Party Opening Balance'] = {
	formatters: {
		debit: currency_or_blank,
		credit: currency_or_blank,
	},
};

function currency_or_blank(value, df, doc) {
	if (!flt(value)) {
		return '';
	}
	return frappe.format(value, df, null, doc);
}
