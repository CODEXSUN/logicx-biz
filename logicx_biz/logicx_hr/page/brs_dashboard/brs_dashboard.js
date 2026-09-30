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

	// how large a .xlsx the page will upload -- the same ceiling the server keeps on
	// what arrives (brs_dashboard.py MAX_FILE_BYTES), mirrored here so that too large
	// a sheet is said so before it is sent rather than after.
	const MAX_SHEET_BYTES = 5 * 1024 * 1024;

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
				// the rows go over as they are, in a JSON body: that is the request
				// body the REST examples post, and it reaches the endpoint as the
				// list it already is rather than as a string of one
				const result = await post_json(BULK_INSERT_METHOD, { data: rows });
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
			const text = await read_text(file);
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
		//
		// It is uploaded as the file it is rather than turned into base64 and sent as
		// an argument, for the reason under "calling" below.
		async rows_from_xlsx(file) {
			if (file.size > MAX_SHEET_BYTES) {
				throw local_error(
					__("{0} is {1}. A bank statement is a small sheet; BRS Import reads up to {2}.", [
						file.name,
						format_size(file.size),
						format_size(MAX_SHEET_BYTES),
					])
				);
			}

			const sheet = await upload(XLSX_TO_ROWS_METHOD, file);
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

		// what stopped the import. A server refusal is in a dialog by the time this
		// runs -- send() puts it up as it comes back -- so it is only restated here;
		// a local error is the page's own and is shown now. Whatever went wrong,
		// `error` can be anything at all -- a thrown TypeError, or nothing -- so the
		// panel reads only the `html` its own errors carry, and says so plainly when
		// there is none.
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

	// a .json file's text, through the browser's FileReader, as a promise. A .xlsx is
	// not read here at all: it goes up as the file it is and is read on the server.
	function read_text(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = () =>
				reject(local_error(__("{0} could not be read from the disk.", [file.name])));
			reader.readAsText(file);
		});
	}

	function extension_of(filename) {
		const parts = cstr(filename).toLowerCase().split(".");
		return parts.length > 1 ? parts.pop() : "";
	}

	/* ------------------------------------------------------------------- calling */

	// nothing here goes through frappe.call. frappe.call posts its arguments as
	// url-encoded form data, and werkzeug refuses url-encoded form data over 500 kB
	// -- which a bank statement passes twice over on its way through this page: once
	// as the workbook, once as the rows read out of it. Both are answered as a 413,
	// and the desk shows every 413 as "File size exceeded the maximum allowed size of
	// 25 MB", which is frappe.boot's own file limit printed back rather than the one
	// that was reached.
	//
	// A JSON body and a multipart file part are both read without being parsed as
	// form data at all, so neither is held to that limit.

	// a whitelisted method, posted as JSON: the body the REST examples post, which is
	// what this page has always been -- a REST client with a file dialog in front of
	// it (doctype/brs_transaction/Bulk-Insert.MD).
	function post_json(method, args) {
		return send(method, {
			body: JSON.stringify(args),
			headers: { "Content-Type": "application/json" },
		});
	}

	// a whitelisted method, with a file: the file goes up as its own multipart part,
	// which is how a browser sends a file and something frappe.call cannot do at all.
	function upload(method, file) {
		const body = new FormData();
		// the part read back out as frappe.request.files["file"] (brs_dashboard.py).
		// The multipart boundary is the browser's to set, so no Content-Type is given
		// here: setting one would leave the boundary out of it.
		body.append("file", file, file.name);
		return send(method, { body: body });
	}

	// the call itself, answered with what the method returned. frappe.request's error
	// handling is not on this path, so what the server sent is shown here, the way it
	// would have shown it.
	async function send(method, init) {
		let response;
		try {
			response = await fetch(`/api/method/${method}`, {
				method: "POST",
				body: init.body,
				// the desk's own session and csrf token, the two things frappe.call
				// would have carried: the cookie because the request is same-origin,
				// the token because frappe refuses an unsafe method without it
				credentials: "same-origin",
				headers: Object.assign(
					{
						Accept: "application/json",
						"X-Frappe-CSRF-Token": frappe.csrf_token,
					},
					init.headers
				),
			});
		} catch (error) {
			// the request never arrived, so there is no response to read a reason out
			// of: the browser's own is all there is to show
			throw local_error(__("The server could not be reached: {0}", [error.message]));
		}

		const answer = await read_json(response);
		if (!response.ok) {
			const messages = server_messages(answer);
			// a permission refusal carries _error_message instead of a message list,
			// and frappe.call shows that one under "Not permitted"
			const refusal = cstr(answer && answer._error_message);
			if (!messages.length && refusal) {
				messages.push({ message: refusal, title: __("Not permitted") });
			}
			// frappe's own refusal, and nothing has shown it yet on this path
			if (messages.length) {
				show_messages(messages);
				throw error_from(messages);
			}
			// not frappe's refusal but the server's own: a gateway's error page, or a
			// 413 from whatever stands in front of frappe. The status is all it said,
			// and saying that is better than naming a limit it did not.
			throw local_error(
				__("The server refused the request: {0} {1}", [
					response.status,
					response.statusText || "",
				])
			);
		}
		return answer ? answer.message : null;
	}

	// the response body as the JSON frappe answers with, or null when it is not JSON
	// at all -- which is what a gateway's own error page arrives as
	async function read_json(response) {
		try {
			return await response.json();
		} catch (parse_error) {
			return null;
		}
	}

	// frappe's messages as the one error the panel restates, each under the last. The
	// same wording is in a dialog by the time this is read -- send() puts it up as it
	// comes back -- so a refusal that carried no message at all leaves the panel to
	// say only that the import failed.
	function error_from(messages) {
		const text = messages.map((message) => cstr(message.message));
		const error = new Error(text.join(" "));
		error.html = text.join("<br>");
		return error;
	}

	// frappe's messages, shown the way frappe.request shows them: one dialog each,
	// under the title the server threw it with.
	function show_messages(messages) {
		messages.forEach((message) => {
			frappe.msgprint({
				title: message.title || __("Nothing to Import"),
				message: cstr(message.message),
				indicator: message.indicator || "red",
			});
		});
	}

	// frappe's messages, out of the body it answered with. A refused statement comes
	// back as a 417 carrying them -- the status frappe.throw answers with.
	function server_messages(response) {
		return parse_messages((response || {})._server_messages);
	}

	// _server_messages is a JSON list of JSON strings, each one a message object
	// carrying the title and indicator the server threw it with. They are kept whole
	// here rather than reduced to their text, since show_messages() puts them up
	// under those titles; frappe.msgprint reads one such object itself, but not a
	// list of them.
	function parse_messages(server_messages_json) {
		try {
			return JSON.parse(server_messages_json || "[]")
				.map((entry) => JSON.parse(entry))
				.filter((message) => message && message.message);
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
