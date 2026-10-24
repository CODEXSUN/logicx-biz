# Mobile WhatsApp

The Mobile Dashboard's **WhatsApp** button, the green one just left of the "..." in the bar. It sends
a message to the number on screen on WhatsApp, and keeps a copy of it in the number's **Comments**.

**Status: built, not yet run on a site.**

| | |
|---|---|
| **Button** | in the bar of `/app/mobile-dashboard` (`../mobile_dashboard.json`), and of `/app/customer-dashboard` (see [On the Customer Dashboard](#on-the-customer-dashboard)) |
| **Reads** | **WhatsApp Template** (`Title`, `Message Template`) |
| **Saves** | a **Job Comments** on the number -- on the Customer Dashboard, under the Customer -- through the dashboard's own `save_comment` |
| **Files** | `mobile_whatsapp.js` (the button and its dialog) -- no server side |

## What it does

The button is enabled only while the number on screen is a Mobile Contact: a comment's Mobile has to
be one, and every message sent is saved as a comment.

A click opens a dialog, **WhatsApp to {number}**:

- **WhatsApp Template** -- optional. Picking one puts its Message Template in the box below, over
  whatever was there; the text can then be edited before it goes.
- **Message** -- mandatory, plain multi-line text.

**Send** then:

1. saves the message as a Job Comments on the number, with **- Shared via WhatsApp -** added as its
   last line after a blank one, in the desk's muted grey -- an inline colour, so the Job Comments
   form shows it dulled too, and the Comments card dulls the line where it comes last. The
   dashboard reads the number again, so the new card shows up under Comments;
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
- `save_comment(mobile, text, note)` -- the dashboard's, the same one its comment box saves through.
  It saves the comment, with `note` (the script's `SHARED_NOTE`) as a dulled last line, reads the
  number again for the new card, and returns the save's promise.

The class carries `SHARED_NOTE` as a static too, which the dashboard keeps for its cards to tell the
line by.

The dashboard then calls `set_mobile(mobile)` whenever the number on screen changes: the Mobile
Contact's number, or `""` when there is none, which disables the button.

Should the script not have been appended, or its class fail to build, the place stays empty and the
rest of the page works on; the browser console says which.

**After a change to `page_js`, clear the site's cache** (`bench --site <site> clear-cache`): Frappe
caches the hooks.

## On the Customer Dashboard

`/app/customer-dashboard` (`../../customer_dashboard/`) has the same button: `hooks.py` lists this
script under `"customer-dashboard"` too, and that page builds it as the Mobile Dashboard does, in the
same place in its bar. The script is the same file, unchanged; what differs is the number the page
gives it and what the page's own `save_comment` does with the message:

- the button is enabled while the Customer on screen was found and its **Mobile No** is exactly 10
  digits -- the number the dialog is titled with and WhatsApp is opened on. A Customer with no Mobile
  No, or one saved before the 10-digit rule, leaves it disabled;
- **Send** saves the message as a Job Comments filed on the **Customer** itself (Job Type `Customer`,
  Job ID the Customer), not on the number, so it needs no Mobile Contact. The card shows up under
  that page's Comments, the Shared via WhatsApp line dulled, and the Job Activity the comment posts
  under its Activity.
