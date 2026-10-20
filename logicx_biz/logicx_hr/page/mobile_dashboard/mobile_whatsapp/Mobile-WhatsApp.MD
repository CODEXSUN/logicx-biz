# Mobile WhatsApp

The Mobile Dashboard's **WhatsApp** button, the green one just left of the "..." in the bar. It sends
a message to the number on screen on WhatsApp, and keeps a copy of it in the number's **Comments**.

**Status: built, not yet run on a site.**

| | |
|---|---|
| **Button** | in the bar of `/app/mobile-dashboard` (`../mobile_dashboard.json`) |
| **Reads** | **WhatsApp Template** (`Title`, `Message Template`) |
| **Saves** | a **Job Comments** on the number, through the dashboard's own `save_comment` |
| **Files** | `mobile_whatsapp.js` (the button and its dialog) -- no server side |

## What it does

The button is enabled only while the number on screen is a Mobile Contact: a comment's Mobile has to
be one, and every message sent is saved as a comment.

A click opens a dialog, **WhatsApp to {number}**:

- **WhatsApp Template** -- optional. Picking one puts its Message Template in the box below, over
  whatever was there; the text can then be edited before it goes.
- **Message** -- mandatory, plain multi-line text.

**Send** then:

1. saves the message as a Job Comments on the number, with **Shared via WhatsApp** added as its last
   line after a blank one. The dashboard reads the number again, so the new card shows up under
   Comments;
2. opens `whatsapp://send?phone=91{number}&text={message}` -- the message as written, URL-encoded,
   without the Shared via WhatsApp line. `91` is India's code, as on the Enquiry and Job Comments
   forms.

The comment is saved first, so nothing goes out unrecorded. A failed save leaves the dialog up, with
the message, to try again.

WhatsApp is opened after a round trip to the server, not by the click itself, so a browser may block
it as a popup. When `window.open` comes back empty, the page offers an **Open WhatsApp to send the
message** link to click instead.

## How it is put together

Frappe reads one script out of a page's folder, `mobile_dashboard.js`. This one is in its own folder,
so it reaches the page through the `page_js` hook, as the BRS Dashboard's tabs do
([`BRS-Dashboard.MD`](../../../../logicx_banking/page/brs_dashboard/BRS-Dashboard.MD)): `hooks.py`
lists it under `"mobile-dashboard"`, and Frappe appends it to `mobile_dashboard.js` when it loads the
page.

The script registers its class:

```js
frappe.provide("logicx_biz.mobile_dashboard");
logicx_biz.mobile_dashboard.whatsapp = MobileWhatsApp;
```

and the dashboard builds it with the page (`setup_whatsapp`), handing it:

- `$wrapper` -- the button's empty place in the bar, `[data-slot="whatsapp"]`. Where that place sits
  is the dashboard's CSS; the button's own look is this script's, injected under the `logicx-mw-`
  prefix;
- `save_comment(mobile, text)` -- the dashboard's, the same one its comment box saves through. It
  saves the comment, reads the number again for the new card, and returns the save's promise.

The dashboard then calls `set_mobile(mobile)` whenever the number on screen changes: the Mobile
Contact's number, or `""` when there is none, which disables the button.

Should the script not have been appended, or its class fail to build, the place stays empty and the
rest of the page works on; the browser console says which.

**After a change to `page_js`, clear the site's cache** (`bench --site <site> clear-cache`): Frappe
caches the hooks.
