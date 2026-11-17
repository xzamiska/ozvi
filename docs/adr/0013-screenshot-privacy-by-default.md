# 0013 Screenshot privacy by default: covering in a copy of the page

**Status:** accepted 2026-11-12

**Context.** Until now the widget screenshot blurred (CSS `blur(10px)` on the live page) only password fields and elements with `data-ozvi-mask`. Everything else, phone numbers, e-mails, names, form values, was readable in the image unless the host app's developer marked it by hand. On top of that, blurred short text can be partly guessed, and the style briefly changed the page the person sees.

**Decision.**
- The screenshot is drawn from a copy of the page (modern-screenshot `onCloneNode`) that the widget adjusts first; the live page does not change.
- Covering uses a **solid rectangle** (text transparent on a background, images are not drawn), not blurring: what is covered never gets into the pixels at all.
- **By default ("auto")**: the values of all `input`/`textarea`/`select`/`contenteditable`; in text, e-mails, phone numbers (9–15 digits), IBAN, cards (Luhn), JWT and `Bearer`/`Basic` (shared `sensitiveRanges` rules in `@ozvi/sdk/mask`); whole `data-ozvi-mask` elements.
- **"all"** (`OzviConfig.mask = "all"`): all text and images except `data-ozvi-unmask`, for healthcare, finance and the like.
- If masking fails, the report goes **without** a screenshot, never with an unmasked one.

**Rejected.** Keeping the blur and only extending the list of selectors: blurring is not reliable and would still put the burden on the integrator. Masking on the server: the image would already have left the browser.

**Consequences.** Names and free text cannot be recognised by their shape, so `data-ozvi-mask` is still needed for them. Some long numbers (e.g. 10-digit order IDs) get covered even when they are not sensitive; this errs on the side of privacy. The code is in `widget-shot.js`, which loads only when reporting, so the initial `widget.js` does not grow.
