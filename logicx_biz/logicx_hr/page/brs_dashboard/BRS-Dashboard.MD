# BRS Dashboard

The desk page for bank reconciliation: a strip of tabs, each its own piece of work in its own folder
under this one. The page itself does nothing but hold them.

| | |
|---|---|
| **Page** | `/app/brs-dashboard` (`brs_dashboard.json`; System Manager, TM Admin, TM User) |
| **Files** | `brs_dashboard.js` (the tab strip), and a folder per tab |

## Tabs

| Tab | Folder | What |
|-----|--------|------|
| **Import** | [`brs_import/`](brs_import/BRS-Import.MD) | Posts a `.json` or `.xlsx` bank statement to BRS Transaction's bulk insert, and shows what came back. |
| **Transaction** | [`brs_transaction_report/`](brs_transaction_report/BRS-Transaction-Report.MD) | A report of BRS Transactions, narrowed by Bank Account, Date and a search through Reference Number and Description. |

## How a tab is put together

Frappe reads one script out of a page's folder, `brs_dashboard.js`. A tab's script is in its own
folder, so it reaches the page through the `page_js` hook instead: `hooks.py` lists it under
`"brs-dashboard"`, and Frappe appends it to `brs_dashboard.js` when it loads the page. Whatever
server side a tab has is in the same folder (`brs_import/brs_import.py`), whitelisted at its own
path -- `logicx_biz.logicx_hr.page.brs_dashboard.brs_import.brs_import.import_sheet`.

The tab's script registers its class under the tab's key:

```js
frappe.provide("logicx_biz.brs_dashboard.tabs");
logicx_biz.brs_dashboard.tabs["import"] = BRSImport;
```

and `brs_dashboard.js` lists the key and the title in `TABS`, which is the strip's order. The class
is built the first time its tab is shown -- so a tab the user never opens never fetches anything --
and is handed `{ $wrapper }`, the tab's empty pane, to render into. It is built once; if it has an
`on_show()`, that is called every time the tab comes on screen -- the first time too, and whenever
the user comes back to the page. A tab fetches what it shows in `on_show()`, not in its constructor,
or it fetches it twice on the first showing. Each tab brings its own buttons and injects its own styles under its own prefix
(`logicx-bi-` for Import, `logicx-bt-` for Transaction); the page's header and primary action are left alone, since every tab
shares them.

To add a tab:

1. a folder under this one, with an `__init__.py` if it has a server side, and its script;
2. its script's path in `hooks.py`'s `page_js`, under `"brs-dashboard"`;
3. its key and title in `TABS` in `brs_dashboard.js`.

**After a change to `page_js`, clear the site's cache** (`bench --site <site> clear-cache`):
Frappe caches the hooks, and a tab whose script was not appended says so in its pane rather than
showing anything.
