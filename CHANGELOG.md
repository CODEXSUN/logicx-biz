# Changelog

All notable changes to **logicx-biz** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-08-19

### Added

- **Rack DocType** (`LogicX ERP`) — master for storage racks. Auto-named from a
  unique, mandatory `Rack Name`. Permissions: `TM User` (read/create/write),
  `TM Admin` (full, including delete/import, plus permlevel 1).
- **Crate DocType** (`LogicX ERP`) — master for crates, with a `Crate Name`
  (unique, mandatory, auto-name source) and an optional `Rack` link so a crate can
  be located on a rack. `Rack` is exposed as a standard list filter. Same role
  permissions as Rack.
- **`Item.crate` custom field** — a `Crate` link on **Item**, inserted after
  `stock_uom` and available as a standard filter, tying stock items to the crate
  they are stored in.
- **"Doc" section on the LogicX ERP home workspace** — new header block with
  shortcuts and workspace links to **Item**, **Rack** and **Crate**.
- **"Doc" section in the LogicX ERP sidebar** (`workspace_sidebar/logicx_erp.json`) —
  collapsible section (idx 13) with child links to Item, Rack and Crate.

### Changed

- `hooks.py`: the `Custom Field` fixture filter now also exports `Item-crate`
  alongside `Employee-cost_per_hour`.
- `fixtures/custom_field.json`: regenerated to include the `Item-crate` definition.

## [0.1.2] - 2026-08-19

### Added

- Initial release: `LogicX HR` and `LogicX ERP` modules, the LogicX ERP home
  workspace and sidebar with stock, sales, receipts and outstanding reports, the
  `Employee-cost_per_hour` custom field, desk fixes and TM role fixtures.
