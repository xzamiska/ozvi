# Privacy kit: text for your privacy policy

> This is not legal advice. Check both the texts and this guide with a lawyer before using them.

Companies that embed Ozvi in their app (for example Billiwo) have to tell their users what happens to their data and enter the processing in their records of processing activities (Art. 30 GDPR). The privacy kit gives them ready-made paragraphs for this.

## Where to find it

Project settings → **Project data** → **Text for your privacy policy** (`/<project>/admin#privacy-kit`, admins only).

- Language of the text: any of the board's 6 languages (sk, cs, en, pl, hu, de), independent of the interface language.
- Sections: purpose and legal basis (a draft to review), data categories, recipients and processors, retention, data subjects' rights, a table of cookies and browser storage.
- Copy section by section or everything at once as Markdown or HTML.
- Details in square brackets (`[contact e-mail]`, `[hosting provider, country]` …) have to be filled in by hand. The kit does not guess them.

The text is built from the **actual settings of the project and the instance**:

| What | Where from |
|---|---|
| Cloud / self-hosted mode | `OZVI_MODE` |
| Sign-in (app SSO, e-mail code, OIDC) | project settings → Sign-in |
| What the widget sends (screenshot, console, request log, steps, session links) | the widget defaults; the admin unticks what they turned off in their app (`OzviConfig`, the `network`, `actions`, `links` attributes) |
| AI features and their provider | plan (cloud) / `OZVI_AI_PROVIDER`, `OZVI_AI_BASE_URL` (self-hosted); translation according to Languages → Post translation |
| Integrations | connected GitHub, Linear, Jira, active webhooks (Slack, Teams, Discord, JSON) |
| E-mails | cloud: Resend via Ozvi; self-hosted: the host from `SMTP_URL` or Ecomail |
| Attachments, embeddings (self-hosted) | `S3_ENDPOINT`, `OZVI_EMBEDDINGS_URL` (a local server is not listed) |
| Retention | Project data → Data retention |
| Cookies and storage | `lib/storage-keys.ts`, `cookieName`, `flowCookieName`, `LOCALE_COOKIE`; the `privacy-kit.test.ts` test searches the widget and board code and fails when a new key appears that the table does not know |

## Who is who

### Ozvi cloud

- The **customer** (the company with the board) is the **controller** of its users' data.
- **Ozvi** is the **processor** (Art. 28 GDPR). A data processing agreement (DPA) is needed. It is part of the terms of service (since 12 November 2026) and published at [ozvi.io/dpa](https://ozvi.io/dpa); the binding Slovak text is in [`DPA.sk.md`](DPA.sk.md), an English translation in [`DPA.md`](DPA.md). A customer who needs a signed copy asks at support@ozvi.io (console → Plan & usage → DPA card → “Request a signed copy”).
- Ozvi's sub-processors are published at `/subprocessors`. In the cloud the kit links to this list and names Resend and, with AI turned on, also Anthropic.
- Integrations (GitHub, Linear, Jira, webhooks) are turned on by the customer through their own accounts, so data goes there on the customer's behalf. The kit lists them as the customer's tools.

### Self-hosted

- The **operator of the installation** (for example Billiwo running Ozvi itself) is the controller. It **does not conclude any DPA** with the authors of Ozvi, because they have no access to the data and the instance sends them nothing. The update check is only a GET with no data about the instance and can be turned off with `OZVI_UPDATE_CHECK=0`.
- Its processors are the providers it chooses itself. The kit lists them according to the configuration (hosting as `[hosting provider, country]`, e-mail according to `SMTP_URL`, AI according to the configured provider, S3, embeddings, integrations).

## Checklist for self-hosting

- [ ] **Hosting:** a data processing agreement with the server provider (Hetzner, OVH, AWS …) and a record of where the data is. The same with the backup provider, if backups are elsewhere.
- [ ] **E-mails:** a DPA with the service in `SMTP_URL` (Resend, Postmark, Amazon SES, Brevo …) or with Ecomail. Check where it processes the e-mails and on what basis it transfers data outside the EU.
- [ ] **AI** (only if turned on via `OZVI_AI_PROVIDER`): with Anthropic or another cloud API, the provider's DPA and terms (no training on your data) and the transfer mechanism. A local model (Ollama, vLLM on your own server) is not a third party.
- [ ] **Embeddings** (`OZVI_EMBEDDINGS_URL`): if it is an external API, the same applies as for AI.
- [ ] **Attachments in S3** (`S3_*`): a DPA with the storage provider.
- [ ] **Integrations:** GitHub, Linear, Jira, Slack, Microsoft Teams, Discord, possibly your own webhooks. You have contracts with them directly; Ozvi sends them data on your behalf. A webhook “including bug reports” also sends private reports.
- [ ] **Retention:** set Project data → Data retention and copy the values into your policy. The kit picks them up automatically.
- [ ] **Widget:** the screenshot masks form fields, e-mails, phone numbers, IBANs, cards and tokens on its own; mark other sensitive places (names, notes, diagnoses) with `data-ozvi-mask`, and for sensitive applications turn on `OzviConfig.mask = "all"`. Turn off what you do not want to send (`OzviConfig.network = false`, `actions = false`) and untick it in the kit.
- [ ] **Data subjects' rights:** every user can export and delete their data themselves on the board under “My data” (`/<project>/me`). Add a contact for other requests to your policy.
- [ ] **Record of processing activities** (Art. 30): the sections “What data we process”, “Who processes the data” and “How long we keep the data” serve as a basis.

## For developers

- Generator: `apps/web/src/lib/privacy-kit.ts` (pure, also runs in the browser). Facts about the project and the instance: `privacy-kit-config.ts` (server, never reads secrets, only hosts). Texts: `messages/*.json` → `privacyKit`.
- Add a new cookie or `localStorage` key to `lib/storage-keys.ts` and to `browserStorage()`, otherwise the test fails.
- New sub-processor in the cloud: update `/subprocessors` (`subprocessors.items`), `DPA.md` and the texts in `privacyKit.recipients`.
