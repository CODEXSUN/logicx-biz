// Quick Entry for Party Opening Balance.
//
// The Party field is a Dynamic Link: it reads the doctype to search from the
// party_type field OF THE DOCUMENT. A quick entry dialog only writes its values
// back into the document when you save, so while the dialog is open Party has
// no doctype to look up and its dropdown never opens -- however cleanly you
// picked a Party Type right above it.
//
// So the dialog's Party field is pointed at the dialog's own party_type value
// instead. Frappe checks df.get_options first, ahead of every document lookup.
//
// Loaded from app_include_js rather than the doctype's own script, because
// quick entry is raised from the list view and the awesomebar too, where the
// form script has never loaded.

frappe.provide('frappe.ui.form');

// the two parties that carry a ledger balance with us; kept in step with
// PARTY_TYPES in party_opening_balance.py, which is what actually enforces it
const PARTY_OPENING_BALANCE_PARTY_TYPES = ['Customer', 'Supplier'];

frappe.ui.form.PartyOpeningBalanceQuickEntryForm = class PartyOpeningBalanceQuickEntryForm extends frappe.ui.form.QuickEntryForm {

	render_dialog() {
		super.render_dialog();
		this.setup_party_fields();
	}

	setup_party_fields() {
		const party_type_field = this.dialog.get_field('party_type');
		const party_field = this.dialog.get_field('party');
		if (!party_type_field || !party_field) {
			return;
		}

		party_field.df.get_options = () => this.dialog.get_value('party_type') || '';

		party_type_field.df.get_query = () => {
			return { filters: { name: ['in', PARTY_OPENING_BALANCE_PARTY_TYPES] } };
		};

		// a Party held over from the previous type would be a party of the wrong kind
		party_type_field.df.onchange = () => {
			this.dialog.set_value('party', '');
			party_field.refresh();
		};
	}

};
