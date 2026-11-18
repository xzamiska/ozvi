# 0014 The widget works without host-app sign-in: e-mail verification in the widget

**Status:** accepted 2026-11-18 (amends [0005](0005-host-app-auth-first.md): sign-in through the host app stays recommended, it is no longer required for the widget)

**Context.** Until now the widget sent reports only with a host-app token (`Authorization: Bearer <signOzviToken>`); without one the server answered 401. A new project therefore needed backend code and a deploy of the host app before the first customer could report anything. Internal reviews (17 Nov 2026) found this to be the main reason a signup does not reach its first report. Boards already sign people in by an e-mail code (`emailLogin`).

**Decision.**
- When the host app gives no token and the project has e-mail sign-in on (`emailLogin`, on by default in the cloud), the widget asks for an e-mail when a report, idea or vote is sent. The person types the 6-digit code from the e-mail **inside the widget**; the report they wrote stays as it is and is sent right after.
- Code and limits are the board's (`lib/email-login.ts`): 15 minutes, single use, 5 attempts, per-address and per-IP limits. The person is the same as on the board (`email:` user or an account whose e-mail the app verified), so "My reports" and the reply e-mails work as with SSO.
- After the code the server returns a **widget token**: `ozw.<payload>.<HMAC>` signed with `OZVI_SESSION_SECRET`, bound to the project, the user and their `sessionVersion`, valid 30 days. "Sign out everywhere", deleting the account or turning `emailLogin` off end it at once; a blocked person stays blocked from posting.
- The widget keeps it in `localStorage` (`ozvi:wt:<host>/<project>`), listed in the privacy kit; `Ozvi.logout()` removes it. A host-app token always wins over it.
- Nothing is stored before the code is verified: no item, no attachment, no user. Allowed origins apply as before.
- The verification UI is a lazy chunk (`widget-verify.js`); `widget.js` stays within its 20 kB budget.

**Rejected.**
- *Anonymous reports with an optional e-mail.* No way to tell the reporter about the fix, spam with attachments, and private reports without an owner.
- *Verification only after sending (report held as pending until the link is clicked).* The report and screenshot would be stored for an unknown person; the person also leaves the app to click a link.
- *Making SSO mandatory in the onboarding.* That is the status quo the reviews measured.

**Consequences.** The team gets the reporter's e-mail but no name, plan or MRR from the app; the admin keeps recommending SSO. `emailLogin` now also governs the widget; turning it off returns the widget to SSO only. The token lives in the host app's origin, so an XSS in the host app could read it, the same exposure as a host-app token.
