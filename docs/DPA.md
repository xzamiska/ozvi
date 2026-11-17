# Data Processing Agreement (DPA) — Ozvi cloud

> English translation for information only. The binding text is the Slovak agreement published at [ozvi.io/dpa](https://ozvi.io/dpa) (source in [DPA.sk.md](DPA.sk.md)); if they differ, the Slovak text applies.

> **Published at [ozvi.io/dpa](https://ozvi.io/dpa)** (since version 1.0, 12 November 2026) as part of the terms of service; the source of truth is the page `apps/web/src/app/dpa/page.tsx`. This file is a working copy for separate signature; when changing it, update both. It applies only to the hosted service (cloud); a self-hosted installation has its own controller.

Template version: {{LEGAL.version}} · effective from {{LEGAL.effective}}

## Parties

**Controller** (the customer, hereinafter the “Customer”):
[business name], company ID (IČO) [IČO], with its registered office at [registered office], represented by [name, position], data protection contact: [e-mail].

**Processor** (the provider of the Ozvi service, hereinafter “Ozvi”):
Zamiska solutions s.r.o., with its registered office at Bajkalská 45G, 821 05 Bratislava-Ružinov, company ID (IČO) 54580242, tax ID (DIČ) 2121731106, VAT ID (IČ DPH) SK2121731106, registered in the Commercial Register of the Bratislava III Municipal Court, Section Sro, Insert No. 160737/B, contact: support@ozvi.io.

This agreement supplements the [Terms of Service](https://ozvi.io/terms) (hereinafter the “Terms”). In the event of a conflict on matters of personal data protection, this agreement prevails.

## 1. Subject matter, duration, nature and purpose of the processing

1.1 **Subject matter:** operation of the Customer's feedback board in the Ozvi service: bug reports, ideas, voting, comments, roadmap, updates, the widget in the Customer's application, e-mail notifications and the integrations that the Customer turns on itself.

1.2 **Duration:** for as long as the Customer uses the service. After a project or account is cancelled, Ozvi proceeds in accordance with clause 10.

1.3 **Nature:** storage, structuring, display, transmission (e-mails, integrations), search, export and erasure; with AI features turned on, also automated processing of text (summaries, drafts, translations), whose output is always only a draft for approval by a person.

1.4 **Purpose:** solely the provision of the service to the Customer in accordance with the Terms. Ozvi does not use the data for advertising, does not sell it and does not use it to train models.

## 2. Categories of data subjects and personal data

2.1 **Data subjects:** users of the Customer's application who submit something, vote or sign in on the board or through the widget; members of the Customer's team; contacts that the Customer imports or adds through an agent (MCP).

2.2 **Categories of data:**

| Category | Examples |
|---|---|
| Identity from the Customer's application | user identifier, e-mail, name, avatar, role |
| Data about the end customer (team only) | company, plan, MRR, if the Customer sends them via SSO |
| Feedback content | ideas, bug reports, comments, votes, attachments |
| Technical context of reports | page address, application version, browser, console errors, log of network requests and steps, links to session recordings, screenshot; masked both in the browser and on the server |
| Operational data | e-mail queue and delivery status, activity log in the settings, sign-in codes |

2.3 The service is not intended for special categories of data (Art. 9 GDPR) or data about children. The Customer shall ensure that it does not send such data to the service (e.g. by masking fields with the `data-ozvi-mask` attribute).

## 3. The Customer's instructions

3.1 Ozvi processes personal data only on the basis of the Customer's documented instructions. The instructions are this agreement, the Terms and the settings the Customer makes in the service (e.g. data retention, integrations, AI features, moderation).

3.2 If, in Ozvi's opinion, an instruction infringes the GDPR or another regulation, Ozvi shall inform the Customer without undue delay.

3.3 If Union or Member State law requires Ozvi to process data beyond the instructions, Ozvi shall inform the Customer before the processing, unless that law prohibits it.

## 4. Confidentiality

Ozvi shall ensure that persons authorised to process personal data have committed themselves to confidentiality or are under a statutory obligation of confidentiality. Only the operator of the service has access to production data, and only to the extent necessary for operation and support.

## 5. Technical and organisational measures (Art. 32 GDPR)

Ozvi takes in particular the following measures:

- **Separation of project data:** every record carries a project identifier and the database enforces separation at row level (row-level security); the application does not connect to the database as a superuser.
- **Encryption of secrets:** secret keys (SSO, OIDC, integrations) are encrypted with AES-256-GCM; access tokens are stored only as hashes (SHA-256).
- **Encryption in transit:** all communication with the service over HTTPS (TLS); the copy of backups outside the data centre is encrypted.
- **Minimisation at source:** the widget masks sensitive values (passwords, tokens, e-mails, IBANs, card numbers) already in the browser; the server masks them again. Request headers are never recorded.
- **Access:** bug reports and their technical log are visible only to the reporter and the project team; the technical log is not sent to integrations (GitHub, Linear, Jira) or webhooks.
- **Retention:** in the project settings the Customer chooses automatic deletion of the technical log of reports (by default after 180 days), of attachments of closed bugs and of inactive imported contacts; deletion runs every night and is recorded in the activity log.
- **Resilience:** daily backups kept for no more than 30 days, on a separate disk of the server and encrypted outside the data centre.
- **Activity log:** changes to settings, roles, tokens and integrations are recorded in the workspace activity log.
- **Abuse protection:** rate limiting, moderation, blocking of users.

Ozvi may change the measures provided that this does not lower the level of protection.

## 6. Sub-processors

6.1 The Customer grants Ozvi a general written authorisation to engage sub-processors. The current list is published at [ozvi.io/subprocessors](https://ozvi.io/subprocessors) and forms part of this agreement.

6.2 Ozvi shall notify the Customer by e-mail of any intended addition or replacement of a sub-processor at least **30 days** in advance. The Customer may object on reasonable data protection grounds; if the parties do not reach agreement, the Customer may terminate the service with immediate effect and Ozvi shall refund the pro rata part of the subscription for the unused period.

6.3 Ozvi shall impose on each sub-processor, by contract, the same data protection obligations as Ozvi has under this agreement, and shall remain liable to the Customer for the sub-processor's performance.

6.4 Integrations that the Customer connects with its own account (GitHub, Linear, Jira, webhooks, chat channels) are recipients acting on the Customer's instruction. Choosing them and the contractual relationship with them are a matter for the Customer.

## 7. Transfers outside the EU/EEA

Data is stored on a server in a Hetzner data centre in Germany (EU). A transfer to a third country takes place only through the sub-processors named in the list under clause 6.1, on the basis of an adequacy decision (including the EU–US Data Privacy Framework) or standard contractual clauses. The mechanism for each of them is stated in the list of sub-processors.

## 8. Assistance to the Customer

8.1 **Data subjects' rights:** the service allows every user to download their data and delete it (My data on the board) and allows the Customer to export and delete an entire project. If Ozvi receives a request from a data subject directly, it shall forward it to the Customer without undue delay and shall not respond to it itself unless the Customer instructs it to.

8.2 **Security, impact assessment, prior consultation:** Ozvi shall provide the Customer with the information available to it that is needed to fulfil the obligations under Art. 32 to 36 GDPR.

## 9. Personal data breach

9.1 Ozvi shall notify the Customer of a personal data breach concerning the Customer's data without undue delay, no later than **48 hours** after becoming aware of it, at the contact given in the Parties section.

9.2 The notification contains, insofar as known at that time: the nature of the breach, the categories and approximate number of data subjects and records concerned, the likely consequences, the measures taken and proposed, and the contact of a person who will provide further information. Ozvi shall provide missing information in phases.

## 10. Return and deletion of data

10.1 The Customer may download a project export (JSON and CSV) at any time in the project settings.

10.2 After the Customer deletes a project, Ozvi deletes its data from the database and the attachment storage immediately. It disappears from backups no later than within 30 days.

10.3 After an account is cancelled or the service ends, Ozvi shall delete the Customer's remaining data within **30 days**, unless Union or Member State law requires its further storage.

## 11. Demonstrating compliance and audit

11.1 On request, Ozvi shall provide the Customer with the information needed to demonstrate compliance with the obligations under Art. 28 GDPR (in particular this agreement, a description of the measures and the list of sub-processors).

11.2 The Customer, or an auditor mandated by the Customer and bound by confidentiality, may carry out an audit, including an inspection, with at least **30 days'** notice, no more than once in 12 months, unless there is a suspected breach. The audit is carried out primarily in writing (questionnaire and supporting documents); an on-site audit is at the Customer's expense and must not put other customers' data at risk.

## 12. Liability

Liability towards data subjects is governed by Art. 82 GDPR. Between the parties, the limitation of liability under the Terms applies, except for damage caused intentionally or through gross negligence.

## 13. Final provisions

13.1 The agreement takes effect on the day it is signed by both parties (or accepted electronically in the service) and remains in force for as long as Ozvi processes the Customer's personal data.

13.2 The agreement is governed by the law of the Slovak Republic. Amendments require written form; changes to the list of sub-processors are governed by clause 6.

13.3 If any provision is invalid, the remaining provisions remain in force.

---

| For the Customer | For Ozvi |
|---|---|
| Name, position: [ ] | Name, position: [ ] |
| Date: [ ] | Date: [ ] |
| Signature: | Signature: |
