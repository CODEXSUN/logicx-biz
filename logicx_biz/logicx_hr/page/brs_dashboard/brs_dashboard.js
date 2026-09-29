(function () {
	const PAGE_NAME = "brs-dashboard";
	const STYLE_ID = "logicx-brs-dashboard-styles";

	// where the rows go: BRS Transaction's bulk insert, the same endpoint the REST
	// examples post to. It decides what is skipped and what is appended, and it is
	// safe to send the same statement twice (doctype/brs_transaction/Bulk-Insert.MD).
	const BULK_INSERT_METHOD =
		"logicx_biz.logicx_hr.doctype.brs_transaction.brs_transaction.bulk_insert";
	// a .xlsx is turned into those same rows here first: the desk has no
	// spreadsheet reader, and openpyxl on the server has (see brs_dashboard.py)
	const XLSX_TO_ROWS_METHOD = "logicx_biz.logicx_hr.brs_dashboard.xlsx_to_rows";

	// the two files the page reads, and what it does with each
	const JSON_EXTENSION = "json";
	const XLSX_EXTENSION = "xlsx";
	const ACCEPT = ".json,.xlsx";

	// the columns a .xlsx has to carry, shown on the page so that the sheet can be
	// got right before it is picked. The server checks them (brs_dashboard.py COLUMNS);
	// this list is only what the user is told, and is kept the same as that one.
	const SHEET_COLUMNS = [
		"bank_account",
		"date",
		"description",
		"reference_number",
		"withdrawal",
		"deposit",
		"closing_balance",
	];

	// how a figure of the result reads: the account's own currency is not asked
	// for, so the balances are shown as plain numbers at two decimals
	const AMOUNT_DECIMALS = 2;

	// the page keeps the last import's result on screen and nothing that goes out
	// of date, so there is no on_page_show: coming back to the page is how a user
	// checks again what the morning's statement did
	frappe.pages[PAGE_NAME].on_page_load = function (wrapper) {
		new BRSDashboard(wrapper);
	};

	// an error found here in the browser rather than answered by the server. The
	// server's own refusals reach the user as frappe's error dialog on their way
	// through; a local one is marked so that the page shows it the same way.
	//
	// `html` is what the panel renders, and a local message is plain text escaped
	// into it: it carries the file's own name, and a name is whatever the person
	// who saved the file typed.
	function local_error(message) {
		const error = new Error(message);
		error.is_local = true;
		error.html = escape_html(message);
		return error;
	}

	class BRSDashboard {
		constructor(wrapper) {
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: __("BRS Dashboard"),
				single_column: true,
			});

			inject_styles();

			this.$el = $('<div class="logicx-bd"></div>').appendTo(this.page.main).html(render_scaffold());
			// while a file is being read and posted: a second click would post the
			// same statement again, which bulk_insert would skip whole -- harmless,
			// and still worth not doing
			this.busy = false;

			this.setup_file_input();
			this.page.set_primary_action(__("BRS Import"), () => this.pick_file());
		}

		/* ------------------------------------------------------------ the file */

		// the dialog is the browser's own: the file is read here, in the page, and
		// never uploaded as a File record -- a bank statement is posted once and
		// the transactions are what is kept, not the sheet they came from
		setup_file_input() {
			this.$file = $(`<input type="file" class="hidden" accept="${ACCEPT}">`)
				.appendTo(this.$el)
				.on("change", (event) => {
					const file = event.target.files && event.target.files[0];
					if (file) this.import_file(file);
				});
		}

		pick_file() {
			if (this.busy) return;
			// cleared first, so that picking the same file again -- a sheet just
			// corrected and saved over -- still counts as a change
			this.$file.val(null);
			this.$file[0].click();
		}

		/* --------------------------------------------------------- the import */

		// one click, start to finish: the rows are read out of the file, posted to
		// bulk_insert, and what it answered is rendered. Nothing is posted in
		// pieces -- the call is one database transaction on the server -- so
		// whatever happens, what the panel shows is the whole of it.
		async import_file(file) {
			const extension = extension_of(file.name);
			this.busy = true;
			// freezing is inside the try, so that whatever it throws still reaches
			// the finally below rather than leaving the desk covered -- and only a
			// freeze that went up is taken down again, since the count it keeps is
			// the whole desk's
			let frozen = false;

			try {
				this.render_reading(file, extension);
				frappe.dom.freeze(__("Importing {0}...", [escape_html(file.name)]));
				frozen = true;

				if (extension !== JSON_EXTENSION && extension !== XLSX_EXTENSION) {
					throw local_error(
						__("{0} is neither a .json nor a .xlsx file. Pick one of those.", [file.name])
					);
				}
				const rows =
					extension === JSON_EXTENSION
						? await this.rows_from_json(file)
						: await this.rows_from_xlsx(file);
				// the rows are handed over as JSON text: a list argument would be
				// stringified on its way out anyway, and the endpoint reads either,
				// so it is written out here where it can be seen
				const result = await call(BULK_INSERT_METHOD, { data: JSON.stringify(rows) });
				this.render_result(file, extension, result);
			} catch (error) {
				this.render_error(file, extension, error);
			} finally {
				if (frozen) frappe.dom.unfreeze();
				this.busy = false;
			}
		}

		// a .json file holds the rows already, so it is posted as it stands: the
		// file is only parsed here, to tell a file that is not JSON at all from a
		// statement the server has something to say about
		async rows_from_json(file) {
			const text = await read_file(file, "text");
			let content;
			try {
				content = JSON.parse(text);
			} catch (error) {
				throw local_error(__("The file is not valid JSON: {0}", [error.message]));
			}

			// either shape: the rows on their own, or the whole request body the
			// REST examples post -- {"data": [...]}
			const rows = Array.isArray(content) ? content : content && content.data;
			if (!Array.isArray(rows) || !rows.length) {
				throw local_error(
					__(
						'The file has no statement rows: expected a list of rows, or an object with a "data" list.'
					)
				);
			}
			return rows;
		}

		// a .xlsx goes to the server to be read, and comes back as the same rows a
		// .json file would have held. The sheet's columns are checked there, so a
		// sheet with a column too many never reaches bulk_insert.
		async rows_from_xlsx(file) {
			const data_url = await read_file(file, "data_url");
			// "data:<mime>;base64,<the file>" -- the server decodes the tail
			const content = cstr(data_url).split(",")[1] || "";
			const sheet = await call(XLSX_TO_ROWS_METHOD, { filename: file.name, content });
			const rows = (sheet && sheet.rows) || [];
			if (!rows.length) {
				throw local_error(__("The sheet has no rows to post."));
			}
			return rows;
		}

		/* --------------------------------------------------------- the result */

		render_reading(file, extension) {
			this.$panel().html(`
				<div class="logicx-bd-status is-busy">
					${__("Reading {0}...", [escape_html(file.name)])}
				</div>
				${render_file_line(file, extension)}
			`);
		}

		render_result(file, extension, result) {
			const inserted = (result && result.inserted) || [];
			const posted = !!inserted.length;

			this.$panel().html(`
				<div class="logicx-bd-status ${posted ? "is-done" : "is-idle"}">
					${
						posted
							? __("{0} of {1} rows posted.", [inserted.length, cint(result.rows)])
							: __("Nothing new to post: every row of the file was already posted.")
					}
				</div>
				${render_file_line(file, extension)}
				${render_summary(result)}
				${render_inserted(inserted)}
				${render_tail(result)}
			`);

			frappe.show_alert({
				message: posted
					? __("{0} transactions posted.", [inserted.length])
					: __("Nothing new to post."),
				indicator: posted ? "green" : "orange",
			});
		}

		// what stopped the import. A server refusal has already been shown by frappe
		// as it came back, so it is only restated here; a local error is the page's
		// own and is shown now. Whatever went wrong, `error` can be anything at all
		// -- a thrown TypeError, or nothing -- so the panel reads only the `html`
		// its own errors carry, and says so plainly when there is none.
		render_error(file, extension, error) {
			const html = (error && error.html) || escape_html(__("The import failed."));
			if (error && error.is_local) {
				frappe.msgprint({
					title: __("Nothing to Import"),
					message: html,
					indicator: "red",
				});
			} else {
				console.error(error);
			}

			this.$panel().html(`
				<div class="logicx-bd-status is-error">${__("Nothing was posted.")}</div>
				${render_file_line(file, extension)}
				<div class="logicx-bd-error">${html}</div>
			`);
		}

		$panel() {
			return this.$el.find('[data-panel="result"]');
		}
	}

	/* ----------------------------------------------------------------- reading */

	// the browser's FileReader, as a promise. "text" for a .json, "data_url" for a
	// .xlsx, whose bytes have to reach the server as base64.
	function read_file(file, as) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = () =>
				reject(local_error(__("{0} could not be read from the disk.", [file.name])));
			if (as === "text") reader.readAsText(file);
			else reader.readAsDataURL(file);
		});
	}

	function extension_of(filename) {
		const parts = cstr(filename).toLowerCase().split(".");
		return parts.length > 1 ? parts.pop() : "";
	}

	/* ------------------------------------------------------------------- calling */

	// a whitelisted method, answered with what it returned. frappe.xcall would do,
	// but it rejects with the response's `message` -- which a server that threw did
	// not send at all -- and the page would then have nothing to show. The response
	// itself is what carries the reason, so the call is made here and kept.
	function call(method, args) {
		return new Promise((resolve, reject) => {
			let settled = false;
			frappe.call({
				method: method,
				args: args,
				callback: (response) => {
					settled = true;
					resolve(response ? response.message : null);
				},
				error: (response) => {
					settled = true;
					reject(server_error(response));
				},
				// a failure that took some other path out of frappe.request settles
				// here instead: a call that never settles leaves the desk frozen,
				// waiting on it
				always: (response) => {
					if (!settled) reject(server_error(response));
				},
			});
		});
	}

	// why a call failed, as an error the panel can show. frappe has already put the
	// same wording in a dialog of its own -- these are the messages it collected --
	// so a response that carried none leaves the panel to say only that it failed.
	function server_error(response) {
		const messages = server_messages(response);
		const error = new Error(messages.join(" "));
		error.html = messages.join("<br>");
		return error;
	}

	// frappe's messages, from either shape a failure arrives in: the parsed body,
	// when the desk handed one over, or the jqXHR, which is what jQuery passes on a
	// 417 -- the status frappe.throw answers with, and so the shape a refused
	// statement comes back as.
	function server_messages(response) {
		const body = response || {};
		return parse_messages(body._server_messages).concat(
			parse_messages((body.responseJSON || {})._server_messages)
		);
	}

	function parse_messages(server_messages_json) {
		try {
			return JSON.parse(server_messages_json || "[]")
				.map((entry) => cstr(JSON.parse(entry).message))
				.filter(Boolean);
		} catch (parse_error) {
			// not the JSON-inside-JSON frappe sends, so there is nothing to read
			return [];
		}
	}

	/* --------------------------------------------------------------- rendering */

	function render_scaffold() {
		const columns = SHEET_COLUMNS.map(
			(column) => `<code class="logicx-bd-column">${column}</code>`
		).join(" ");

		return `
			<div class="logicx-bd-card">
				<div class="logicx-bd-title">${__("What BRS Import reads")}</div>
				<div class="logicx-bd-help">
					<p>${__("A <b>.json</b> file of statement rows, or a <b>.xlsx</b> sheet of them: one bank account per file, in the bank's own order, oldest row first.")}</p>
					<p>${__("A sheet carries exactly these columns, and no others:")}<br>${columns}</p>
					<p>${__("Rows already posted are skipped and the rest are appended, so the same file can be imported twice. The file has to reach back far enough to include the account's last posted transaction.")}</p>
				</div>
			</div>
			<div class="logicx-bd-card" data-panel="result">
				<div class="logicx-bd-status is-idle">${__("No file imported yet.")}</div>
			</div>
		`;
	}

	function render_file_line(file, extension) {
		const format = extension === XLSX_EXTENSION ? __("Excel sheet") : __("JSON");
		return `
			<div class="logicx-bd-file">
				<span class="logicx-bd-file-name">${escape_html(file.name)}</span>
				<span class="logicx-bd-file-meta">${format} &middot; ${format_size(file.size)}</span>
			</div>
		`;
	}

	function render_summary(result) {
		const confirmed = cint(result.confirmed);
		const rows = [
			[__("Bank Account"), link("Bank Account", result.bank_account)],
			[__("Rows in the file"), cint(result.rows)],
			[
				__("Already posted"),
				__("{0} skipped, {1} of them confirmed against the chain", [cint(result.skipped), confirmed]),
			],
			[__("Posted now"), cint((result.inserted || []).length)],
		];

		return `
			<table class="logicx-bd-summary">
				${rows
					.map(
						([label, value]) => `
					<tr>
						<th>${label}</th>
						<td>${value}</td>
					</tr>`
					)
					.join("")}
			</table>
		`;
	}

	function render_inserted(inserted) {
		if (!inserted.length) return "";
		return `
			<div class="logicx-bd-subtitle">${__("Transactions posted")}</div>
			<div class="logicx-bd-chips">
				${inserted.map((name) => link("BRS Transaction", name)).join("")}
			</div>
		`;
	}

	// where the account's chain ended before this import and where it ends now:
	// the same transaction when nothing was posted
	function render_tail(result) {
		const before = result.last_posted_before;
		const after = result.last_posted_after;
		if (!before || !after) return "";

		return `
			<div class="logicx-bd-subtitle">${__("Last posted transaction")}</div>
			<div class="logicx-bd-tail">
				<span>${__("Before")}: ${render_transaction(before)}</span>
				<span>${__("After")}: ${render_transaction(after)}</span>
			</div>
		`;
	}

	function render_transaction(transaction) {
		return `${link("BRS Transaction", transaction.name)}
			<span class="logicx-bd-file-meta">
				${frappe.datetime.str_to_user(transaction.date)} &middot;
				${__("closing")} ${format_number(transaction.closing_balance, null, AMOUNT_DECIMALS)}
			</span>`;
	}

	function link(doctype, name) {
		if (!name) return "&ndash;";
		const route = `/app/${frappe.router.slug(doctype)}/${encodeURIComponent(name)}`;
		return `<a href="${route}">${escape_html(name)}</a>`;
	}

	function format_size(bytes) {
		const kb = cint(bytes) / 1024;
		return kb < 1024
			? `${format_number(kb, null, 1)} KB`
			: `${format_number(kb / 1024, null, 1)} MB`;
	}

	function escape_html(value) {
		return frappe.utils.escape_html(cstr(value));
	}

	/* ------------------------------------------------------------------ styles */

	function inject_styles() {
		let style = document.getElementById(STYLE_ID);
		if (!style) {
			style = document.createElement("style");
			style.id = STYLE_ID;
			document.head.appendChild(style);
		}
		style.textContent = PAGE_STYLES;
	}

	const PAGE_STYLES = `
		.logicx-bd {
			display: flex;
			flex-direction: column;
			gap: var(--margin-md);
			padding: var(--padding-sm) var(--padding-md) var(--padding-lg);
		}

		.logicx-bd-card {
			padding: var(--padding-md) var(--padding-lg);
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md);
		}

		.logicx-bd-title,
		.logicx-bd-subtitle {
			font-size: var(--text-md);
			font-weight: 600;
			color: var(--text-color);
		}

		.logicx-bd-subtitle {
			margin-top: var(--margin-md);
			margin-bottom: var(--margin-xs);
		}

		.logicx-bd-help {
			margin-top: var(--margin-xs);
			color: var(--text-muted);
			font-size: var(--text-md);
		}

		.logicx-bd-help p {
			margin-bottom: var(--margin-xs);
		}

		.logicx-bd-column {
			display: inline-block;
			margin: 2px 4px 2px 0;
		}

		/* the one line that says how the import went, whatever else the panel
		   shows under it */
		.logicx-bd-status {
			font-size: var(--text-md);
			font-weight: 600;
		}

		.logicx-bd-status.is-idle {
			color: var(--text-muted);
			font-weight: normal;
		}

		.logicx-bd-status.is-busy {
			color: var(--text-muted);
		}

		.logicx-bd-status.is-done {
			color: var(--green-600);
		}

		.logicx-bd-status.is-error {
			color: var(--red-600);
		}

		.logicx-bd-file {
			display: flex;
			flex-wrap: wrap;
			align-items: baseline;
			gap: var(--margin-sm);
			margin-top: var(--margin-xs);
		}

		.logicx-bd-file-name {
			font-weight: 500;
			color: var(--text-color);
		}

		.logicx-bd-file-meta {
			color: var(--text-muted);
			font-size: var(--text-sm);
		}

		.logicx-bd-summary {
			margin-top: var(--margin-md);
		}

		.logicx-bd-summary th,
		.logicx-bd-summary td {
			padding: 3px var(--padding-md) 3px 0;
			vertical-align: top;
			font-size: var(--text-md);
			font-weight: normal;
		}

		.logicx-bd-summary th {
			color: var(--text-muted);
			white-space: nowrap;
		}

		/* the transactions posted, as one wrapping row of links rather than a
		   list: a long statement posts a great many of them */
		.logicx-bd-chips {
			display: flex;
			flex-wrap: wrap;
			gap: var(--margin-xs) var(--margin-sm);
			font-size: var(--text-md);
		}

		.logicx-bd-tail {
			display: flex;
			flex-direction: column;
			gap: 2px;
			font-size: var(--text-md);
		}

		.logicx-bd-error {
			margin-top: var(--margin-xs);
			color: var(--text-color);
			font-size: var(--text-md);
		}
	`;
})();
