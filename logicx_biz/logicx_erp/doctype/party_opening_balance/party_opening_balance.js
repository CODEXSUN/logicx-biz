// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

const DOCTYPE_PATH = 'logicx_biz.logicx_erp.doctype.party_opening_balance.party_opening_balance';

// only the two parties that carry a ledger balance with us open one here
const PARTY_TYPES = ['Customer', 'Supplier'];

// an opening balance sits on one side of the ledger, so the other side is
// always nil -- shown blank rather than as a 0.00 that reads like a figure
const AMOUNT_FIELDS = ['debit', 'credit'];

frappe.ui.form.on('Party Opening Balance', {

	setup: function (frm) {
		frm.set_query('party_type', function () {
			return { filters: { name: ['in', PARTY_TYPES] } };
		});
	},

	onload: function (frm) {
		if (frm.is_new()) {
			set_opening_defaults(frm);
		}
	},

	refresh: function (frm) {
		AMOUNT_FIELDS.forEach(function (fieldname) {
			frm.set_df_property(fieldname, 'formatter', currency_or_blank);
		});
	},

	party_type: function (frm) {
		frm.set_value('party', null);
		frm.set_value('party_name', null);
	},

	party: function (frm) {
		set_party_name(frm);
	},

});

// company and posting date are read-only, so the form fills them itself: the
// default company, and the start of the fiscal year today falls in
function set_opening_defaults(frm) {
	if (frm.doc.company && frm.doc.posting_date) return;
	frappe.call({
		method: DOCTYPE_PATH + '.get_opening_defaults',
		args: { company: frm.doc.company },
		callback: function (r) {
			if (!r.message) return;
			frm.set_value('company', r.message.company);
			frm.set_value('posting_date', r.message.posting_date);
		},
	});
}

function set_party_name(frm) {
	if (!frm.doc.party_type || !frm.doc.party) {
		frm.set_value('party_name', null);
		return;
	}
	frappe.call({
		method: DOCTYPE_PATH + '.get_party_name',
		args: { party_type: frm.doc.party_type, party: frm.doc.party },
		callback: function (r) {
			frm.set_value('party_name', r.message || frm.doc.party);
		},
	});
}

// the stock Currency formatter, except that a nil amount comes out empty
function currency_or_blank(value, df, options, doc) {
	if (!flt(value)) {
		return '';
	}
	return frappe.form.formatters.Currency(value, df, options, doc);
}
