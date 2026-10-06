// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

const DOCTYPE_PATH = "logicx_biz.logicx_banking.doctype.brs_transaction.brs_transaction";

// a Bank Account's BRS Transactions form a chain, and a new one joins it at the end:
// after the account's last posted transaction, opening at what that one closed at.
// Both are filled here as soon as the Bank Account is picked; the insert works them
// out again, so what is filled here is only a head start for the user.
frappe.ui.form.on("BRS Transaction", {

	bank_account(frm) {
		set_chain_tail(frm);
	},

	is_opening(frm) {
		set_chain_tail(frm);
	},

});

async function set_chain_tail(frm) {
	// a posted transaction cannot be updated, so only a new one is filled; an
	// opening transaction starts the chain, so it has nothing before it
	if (!frm.is_new() || !frm.doc.bank_account || frm.doc.is_opening) {
		clear_chain_tail(frm);
		return;
	}

	const bank_account = frm.doc.bank_account;
	const tail = await frappe.xcall(DOCTYPE_PATH + ".get_chain_tail", { bank_account });
	// the Bank Account may have been changed again while the call was out
	if (!tail || frm.doc.bank_account !== bank_account) {
		return;
	}

	if (!tail.has_opening_balance) {
		clear_chain_tail(frm);
		frappe.show_alert({
			message: __("{0} has no opening balance yet. Ask your administrator to add one (even if it is zero).", [bank_account]),
			indicator: "orange",
		});
		return;
	}

	await frm.set_value({
		previous_transaction: tail.previous_transaction,
		opening_balance: tail.opening_balance,
	});
}

function clear_chain_tail(frm) {
	if (!frm.is_new()) {
		return;
	}
	frm.set_value({ previous_transaction: null, opening_balance: 0 });
}
