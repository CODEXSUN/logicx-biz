// The Mobile Dashboard's WhatsApp button: a message, from a WhatsApp Template
// or typed, saved as a comment on the number on screen and sent to it on
// WhatsApp (Mobile-WhatsApp.MD).
//
// Not a page of its own. hooks.py's page_js appends this file to
// mobile_dashboard.js when the page is loaded, and the dashboard builds the
// button out of the class this registers, into its place in the bar.
(function () {
	const STYLE_ID = "logicx-mobile-whatsapp-styles";

	// what the dialog picks its message from. the message is saved as a
	// comment too, with SHARED_NOTE as its last line, and sent to the number in
	// India, as the Enquiry and Job Comments forms send it.
	const TEMPLATE_DOCTYPE = "WhatsApp Template";
	const SHARED_NOTE = __("Shared via WhatsApp");
	const WHATSAPP_COUNTRY_CODE = "91";

	// WhatsApp's own mark, drawn rather than set as a glyph for the reason the
	// dashboard's marks are: a glyph sits on a text baseline and never quite
	// centres in a disc
	const WHATSAPP_ICON =
		'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

	class MobileWhatsApp {
		// built by the dashboard with the page, into the button's place in the
		// bar. `save_comment(mobile, text)` is the dashboard's own, the one its
		// comment box saves through: it saves the comment, shows the new card,
		// and returns the save's promise.
		constructor({ $wrapper, save_comment }) {
			inject_styles();

			this.save_comment = save_comment;
			// the Mobile Contact on screen, or "" when there is none -- no
			// comment can be saved then, so the button is disabled (see set_mobile)
			this.mobile = "";
			this.$btn = $(render_button()).appendTo($wrapper).on("click", () => this.open());

			function inject_styles() {
				let style = document.getElementById(STYLE_ID);
				if (!style) {
					style = document.createElement("style");
					style.id = STYLE_ID;
					document.head.appendChild(style);
				}
				style.textContent = BUTTON_STYLES;
			}

			// round like the "..." beside it, in WhatsApp's green with its mark
			// drawn in. disabled until a Mobile Contact is found.
			function render_button() {
				return `
					<button type="button" class="btn logicx-mw-btn" disabled
						title="${__("WhatsApp")}" aria-label="${__("WhatsApp")}">
						${WHATSAPP_ICON}
					</button>`;
			}
		}

		// told by the dashboard whenever the number on screen changes
		set_mobile(mobile) {
			this.mobile = mobile || "";
			this.$btn.prop("disabled", !this.mobile);
		}

		/* -------------------------------------------------------------- dialog */

		// a dialog on the number on screen, with a template to pick and the
		// message it fills in, open to editing before it goes. made once, and
		// cleared on every opening. the number is kept as it was when the
		// dialog opened, for Send to go to.
		open() {
			if (!this.mobile) return;
			const dialog = this.dialog || (this.dialog = this.make_dialog());
			dialog.clear();
			this.dialog_mobile = this.mobile;
			this.filled_template = null;
			dialog.set_title(__("WhatsApp to {0}", [this.mobile]));
			dialog.show();
		}

		make_dialog() {
			return new frappe.ui.Dialog({
				title: __("WhatsApp"),
				fields: [
					{
						fieldname: "template",
						label: __("WhatsApp Template"),
						fieldtype: "Link",
						options: TEMPLATE_DOCTYPE,
						onchange: () => this.fill_message(),
					},
					{
						fieldname: "message",
						label: __("Message"),
						fieldtype: "Small Text",
						reqd: 1,
					},
				],
				primary_action_label: __("Send"),
				primary_action: (values) => this.send(values.message),
			});
		}

		// a template picked puts its Message Template in the box, over whatever
		// was there. a Link can fire its change more than once for one pick, so
		// the template last filled in is not read again -- which would undo an
		// edit made since. cleared, the next pick fills the box afresh.
		fill_message() {
			const dialog = this.dialog;
			const template = dialog.get_value("template") || null;
			if (template === this.filled_template) return;
			this.filled_template = template;
			if (!template) return;

			frappe.db.get_value(TEMPLATE_DOCTYPE, template, "message_template").then((r) => {
				// another template picked while this one was read
				if (dialog.get_value("template") !== template) return;
				dialog.set_value("message", (r && r.message && r.message.message_template) || "");
			});
		}

		// Send: the message saved as a comment on the number, with SHARED_NOTE
		// as its last line -- then WhatsApp opened on the number with the
		// message as written. saved first, so nothing goes out unrecorded; a
		// failed save leaves the dialog up, message and all, to try again.
		send(message) {
			const text = (message || "").trim();
			if (!text || this.sending) return;

			this.sending = true;
			const dialog = this.dialog;
			const mobile = this.dialog_mobile;
			const $send = dialog.get_primary_btn().prop("disabled", true);

			this.save_comment(mobile, `${text}\n\n${SHARED_NOTE}`)
				.then(() => {
					// first, while the browser still counts it as the click's doing
					// (see open_whatsapp_chat)
					open_whatsapp_chat(mobile, text);
					dialog.hide();
				})
				// frappe has already shown the server's reason
				.catch(() => {})
				.finally(() => {
					this.sending = false;
					$send.prop("disabled", false);
				});
		}
	}

	// handed to the dashboard, which reads it once the page's whole script has run
	frappe.provide("logicx_biz.mobile_dashboard");
	logicx_biz.mobile_dashboard.whatsapp = MobileWhatsApp;

	/* ================================================================= whatsapp */

	// WhatsApp on `mobile`, with `text` typed in ready to send. it opens once
	// the comment is saved, a round trip after the click, which a browser may
	// take for a popup nobody asked for and block -- so when it does, a link
	// to click is offered in its place.
	function open_whatsapp_chat(mobile, text) {
		const url = `whatsapp://send?phone=${WHATSAPP_COUNTRY_CODE}${mobile}&text=${encodeURIComponent(text)}`;
		if (window.open(url, "_blank")) return;
		frappe.msgprint({
			title: __("WhatsApp"),
			message: `<a href="${frappe.utils.escape_html(url)}">${__("Open WhatsApp to send the message")}</a>`,
		});
	}

	/* ==================================================================== styles */

	// injected rather than a sibling .css for the reason the dashboard's are,
	// under this button's own prefix. the place it sits in -- pushed to the
	// right end of the bar, level with the "..." -- is the dashboard's.
	const BUTTON_STYLES = `
		/* the same round size as the "...". its own green rather than
		   .btn-primary's, held through focus and hover as the "..."'s colours
		   are; faded while there is no Mobile Contact to send to. */
		.logicx-mw-btn {
			width: 34px;
			height: 34px;
			padding: 0;
			border-radius: 50%;
			box-shadow: var(--shadow-sm);
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.logicx-mw-btn,
		.logicx-mw-btn:focus {
			color: #fff !important;
			background-color: #25d366 !important;
			border-color: #25d366 !important;
		}

		.logicx-mw-btn:not(:disabled):hover,
		.logicx-mw-btn:not(:disabled):active {
			background-color: #1da851 !important;
			border-color: #1da851 !important;
		}

		.logicx-mw-btn:disabled {
			opacity: 0.45;
			cursor: not-allowed;
		}

		.logicx-mw-btn svg {
			width: 20px;
			height: 20px;
			fill: currentColor;
		}
	`;
})();
