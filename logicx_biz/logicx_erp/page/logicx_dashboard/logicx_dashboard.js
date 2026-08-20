frappe.pages["logicx-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("LogicX Dashboard"),
		single_column: true,
	});

	const draft_tiles = [
		{ label: __("Draft Sales"), doctype: "Sales Invoice" },
		{ label: __("Draft DCs"), doctype: "Delivery Note" },
		{ label: __("Draft Payments"), doctype: "Payment Entry" },
	];

	const $body = $(`
		<style>
			.logicx-stat-row {
				display: flex;
				flex-wrap: wrap;
				gap: var(--margin-md);
			}
			.logicx-stat-tile {
				display: block;
				min-width: 180px;
				padding: var(--padding-md) var(--padding-lg);
				background-color: var(--card-bg);
				border: 1px solid var(--border-color);
				border-radius: var(--border-radius-md);
				text-decoration: none;
			}
			.logicx-stat-tile:hover {
				border-color: var(--gray-400);
				text-decoration: none;
			}
			.logicx-stat-tile .stat-label {
				font-size: var(--text-md);
				color: var(--text-muted);
				margin-bottom: var(--margin-xs);
			}
			.logicx-stat-tile .stat-value {
				font-size: 28px;
				font-weight: 600;
				color: var(--text-color);
			}
		</style>
		<div class="logicx-stat-row"></div>
	`).appendTo(page.main);

	const $row = $body.filter(".logicx-stat-row");

	draft_tiles.forEach((tile) => {
		const $tile = $(`
			<a class="logicx-stat-tile" href="/app/${frappe.router.slug(tile.doctype)}?docstatus=0">
				<div class="stat-label">${tile.label}</div>
				<div class="stat-value">–</div>
			</a>
		`).appendTo($row);

		frappe.db.count(tile.doctype, { filters: { docstatus: 0 } }).then((count) => {
			$tile.find(".stat-value").text(cint(count).toLocaleString());
		});
	});
};
