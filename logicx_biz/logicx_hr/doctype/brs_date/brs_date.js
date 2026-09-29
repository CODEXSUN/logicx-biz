// Copyright (c) 2026, LogicX and contributors
// For license information, please see license.txt

// wrapped so that the names below stay out of the desk's global scope: a
// doctype's form script is evaluated into a <script> of its own, and a
// top-level const shared with another doctype's script would throw
(function () {
	// A BRS Date's form shows the transactions the date is made of: that day's
	// statement lines for its Bank Account, in the order they were posted. The
	// date's own Withdrawal, Deposit and Closing Balance are the totals over exactly
	// these rows (see brs_date.py update_brs_transaction), so this table is what
	// those figures add up from.
	//
	// Read-only, and nothing is written from here: a BRS Date and its transactions
	// are only ever created and deleted through BRS Transaction.

	const TRANSACTION_DOCTYPE = "BRS Transaction";
	const TRANSACTIONS_FIELD = "transactions_html";
	const STYLE_ID = "logicx-brs-date-transactions-styles";

	// a date's transactions are numbered 1 upwards as each is added to it (see
	// brs_transaction.py after_insert), which is the order they read on the statement
	const ORDER_BY = "daily_roll_number asc";

	// a BRS Date holds one day of one account's statement, so this is far past any
	// real count; a date that somehow runs past it is shown up to here and says so,
	// with the list view alongside for the whole of it
	const ROW_LIMIT = 500;

	// what is read per row: the four columns shown, plus `name`, which is both the
	// first column and the link it carries
	const FIELDS = ["name", "withdrawal", "deposit", "reference_number", "description"];

	frappe.ui.form.on("BRS Date", {
		refresh(frm) {
			render_transactions(frm);
		},
	});

	// the columns, in the order they read. Width is a share of the table rather than
	// a pixel count -- the layout is fluid -- so Description takes what the four
	// narrower columns in front of it leave.
	function get_columns() {
		return [
			{ fieldname: "name", label: __("ID"), width: 130, format: format_link },
			{ fieldname: "withdrawal", label: __("Withdrawal"), width: 120, align: "right", format: format_amount },
			{ fieldname: "deposit", label: __("Deposit"), width: 120, align: "right", format: format_amount },
			{ fieldname: "reference_number", label: __("Reference Number"), width: 170, format: format_text },
			{ fieldname: "description", label: __("Description"), width: 340, format: format_text },
		];
	}

	/* ===================================================================== render */

	async function render_transactions(frm) {
		const field = frm.get_field(TRANSACTIONS_FIELD);
		if (!field) {
			return;
		}

		destroy_table(frm);

		// a BRS Date is created by the first BRS Transaction on its date, so an
		// unsaved one has nothing to show
		if (frm.is_new()) {
			field.$wrapper.empty();
			return;
		}

		inject_styles();
		field.$wrapper.html(scaffold_html());
		show_note(frm, __("Loading..."));

		// refresh fires again when the form is reloaded or routed to another BRS
		// Date, and an older call can answer after a newer one; only the latest
		// call's rows are rendered
		const seq = (frm.__brs_transactions_seq = (frm.__brs_transactions_seq || 0) + 1);
		const name = frm.doc.name;

		let rows;
		try {
			rows = await frappe.db.get_list(TRANSACTION_DOCTYPE, {
				fields: FIELDS,
				filters: { brs_date: name },
				order_by: ORDER_BY,
				limit: ROW_LIMIT,
			});
		} catch (error) {
			if (seq === frm.__brs_transactions_seq) {
				show_note(frm, __("Could not load the transactions of this BRS Date."), true);
			}
			return;
		}

		if (seq !== frm.__brs_transactions_seq || frm.doc.name !== name) {
			return;
		}

		if (!rows || !rows.length) {
			// a BRS Date is deleted along with the last transaction left on it, so an
			// empty one is a date whose transactions have lost their link to it
			show_note(frm, __("No BRS Transactions on this BRS Date."));
			return;
		}

		// frappe lazy-loads the datatable bundle; the report views await this too
		await ensure_datatable();
		if (seq !== frm.__brs_transactions_seq || frm.doc.name !== name) {
			return;
		}

		build_table(frm, rows);
		render_footer(frm, rows.length);
	}

	function build_table(frm, rows) {
		const DataTableClass = frappe.DataTable || window.DataTable;
		if (!DataTableClass) {
			show_note(frm, __("Could not load the transactions of this BRS Date."), true);
			return;
		}

		const $body = $table_body(frm);
		$body.empty();

		frm.__brs_transactions_table = new DataTableClass($body.get(0), {
			columns: get_columns().map(to_datatable_column),
			data: rows,
			layout: "fluid",
			inlineFilters: true,
			serialNoColumn: false,
			checkboxColumn: false,
			disableReorderColumn: true,
			dynamicRowHeight: true,
			noDataMessage: __("No BRS Transactions on this BRS Date."),
		});
	}

	// only shown when the date runs past what the table holds, which no real one
	// does; the list view is then where the rest of it is read
	function render_footer(frm, shown) {
		if (shown < ROW_LIMIT) {
			return;
		}
		const route =
			"/app/" +
			frappe.router.slug(TRANSACTION_DOCTYPE) +
			"?brs_date=" +
			encodeURIComponent(frm.doc.name);
		$footer(frm).html(
			'<div class="logicx-bdt-note">' +
				__("Showing the first {0} transactions.", [shown]) +
				' <a href="' +
				route +
				'">' +
				__("Open the full list") +
				"</a></div>"
		);
	}

	function destroy_table(frm) {
		const table = frm.__brs_transactions_table;
		if (table && typeof table.destroy === "function") {
			table.destroy();
		}
		frm.__brs_transactions_table = null;
	}

	function show_note(frm, text, is_error) {
		destroy_table(frm);
		$footer(frm).empty();
		$table_body(frm).html(
			'<div class="logicx-bdt-note' +
				(is_error ? " is-error" : "") +
				'">' +
				frappe.utils.escape_html(text) +
				"</div>"
		);
	}

	function $table_body(frm) {
		return frm.get_field(TRANSACTIONS_FIELD).$wrapper.find(".logicx-bdt-body");
	}

	function $footer(frm) {
		return frm.get_field(TRANSACTIONS_FIELD).$wrapper.find(".logicx-bdt-footer");
	}

	function scaffold_html() {
		return (
			'<div class="logicx-bdt">' +
			'<div class="logicx-bdt-body"></div>' +
			'<div class="logicx-bdt-footer"></div>' +
			"</div>"
		);
	}

	/* ====================================================================== cells */

	function to_datatable_column(col) {
		return {
			id: col.fieldname,
			name: col.label,
			width: col.width,
			align: col.align || "left",
			editable: false,
			// the form owns the arrow keys; a focusable cell would take them
			focusable: false,
			dropdown: true, // sortable
			sortable: true, // sortable
			format: (value) => col.format(value),
		};
	}

	function format_link(name) {
		if (!name) {
			return "";
		}
		// the name comes from autoname, but it is rendered as text rather than
		// trusted as markup
		const href = frappe.utils.get_form_link(TRANSACTION_DOCTYPE, name);
		return '<a href="' + href + '">' + frappe.utils.escape_html(name) + "</a>";
	}

	function format_amount(value) {
		// a transaction carries a Deposit or a Withdrawal, never both (see
		// brs_transaction.py validate_amounts), so the other side of the row reads
		// blank rather than as a zero
		if (!flt(value)) {
			return "";
		}
		return frappe.format(value, { fieldtype: "Currency" }, { always_show_decimals: true });
	}

	function format_text(value) {
		return value ? frappe.utils.escape_html(value) : "";
	}

	/* ==================================================================== loading */

	function ensure_datatable() {
		if (frappe.DataTable || window.DataTable) {
			return Promise.resolve();
		}
		// frappe.require has taken a callback in some versions and returned a promise
		// in others, so settle on whichever one this build offers -- this promise must
		// always resolve, or the table hangs on "Loading..."
		return new Promise(function (resolve) {
			try {
				const loading = frappe.require("data_table.bundle.js", resolve);
				if (loading && typeof loading.then === "function") {
					loading.then(resolve, resolve);
				}
			} catch (error) {
				resolve();
			}
		});
	}

	/* ===================================================================== styles */

	// the styles live here rather than in a sibling brs_date.css because the same
	// injected-<style> approach is what the dashboards and the report JS in this app
	// already use. textContent is re-set on every load so edits to this file take
	// effect without a hard browser reload.
	function inject_styles() {
		let style = document.getElementById(STYLE_ID);
		if (!style) {
			style = document.createElement("style");
			style.id = STYLE_ID;
			document.head.appendChild(style);
		}
		style.textContent = `
			.logicx-bdt {
				border: 1px solid var(--border-color);
				border-radius: var(--border-radius-md);
				overflow: hidden;
			}

			/* frappe-datatable draws its own borders; the wrapper above supplies the
			   outer one, and the rounded corners need to clip the rows inside it */
			.logicx-bdt .datatable {
				border: none;
			}

			/* a bank's narration runs long, and this is the form it is read on, so a
			   Description wraps onto as many lines as it takes -- dynamicRowHeight
			   grows the row to match -- rather than being cut off with an ellipsis.
			   Scoped to the scrollable body: the header labels keep their one line. */
			.logicx-bdt .dt-scrollable .dt-cell__content {
				white-space: normal;
				overflow-wrap: break-word;
				text-overflow: clip;
			}

			.logicx-bdt-note {
				padding: var(--padding-md);
				color: var(--text-muted);
				text-align: center;
			}

			.logicx-bdt-note.is-error {
				color: var(--red-500);
			}

			.logicx-bdt-footer:empty {
				display: none;
			}

			.logicx-bdt-footer .logicx-bdt-note {
				border-top: 1px solid var(--border-color);
				padding: var(--padding-sm);
			}
		`;
	}
})();
