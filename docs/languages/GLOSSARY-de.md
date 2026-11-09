# Ozvi – German (de) glossary

## Register & style
- Formal „Sie“ everywhere (incl. board end users, e-mails, widget). Possessive „Ihr/Ihre“ capitalised.
- Imperatives in buttons as infinitive („Speichern“, „Idee einreichen“), not „Speichere“.
- Gender-neutral where natural without asterisks/colons: „Team“, „Personen“, „alle, die abgestimmt haben“,
  „Mitglieder“, „Nutzende“ avoided where „Nutzer“ is a fixed product term → prefer „Personen“/„Kundschaft“ phrasing;
  „Admin“ (epicene loanword) for administrator role.
- Quotes: „…“. Apostrophe: ’. Dashes: – (Halbgeviertstrich with spaces). Ellipsis: …
- Spelling: „E-Mail“, „E-Mail-Adresse“, „Login/Anmeldung“ → „Anmeldung“, „anmelden“, „abmelden“.
- Numbers/units: non-breaking space before € and %.

## Fixed terms
| English | German | Note |
|---|---|---|
| board | Board (Feedback-Board) | Established in DACH SaaS (Canny/Featurebase DE). |
| project | Projekt | |
| idea | Idee | |
| bug / bug report | Fehler / Fehlermeldung | „Bug“ only where parenthetical clarity helps; UI prefers „Fehler“. |
| report (bug) | Meldung | |
| post (generic item) | Beitrag | |
| roadmap | Roadmap | |
| What’s new / changelog | Neuigkeiten | „Changelog“ only in technical contexts (RSS). |
| release | Release / Version | „Version {version}“ for titles; „Release“ for the noun. |
| vote (n) / to vote | Stimme / abstimmen; „Stimme abgeben“ | upvote button: „Abstimmen“/„Abgestimmt“. |
| voters | Abstimmende | gender-neutral participle |
| comment | Kommentar / kommentieren | |
| internal note | interne Notiz | |
| tag | Tag (pl. Tags) | |
| widget | Widget | |
| admin console | Admin-Konsole | |
| settings | Einstellungen | |
| sign in / sign out | anmelden / abmelden | |
| sign up | registrieren | |
| magic link | Anmeldelink | |
| workspace/team member | Teammitglied | |
| owner | Inhaber | role name |
| moderation | Moderation | |
| pending approval | wartet auf Freigabe | |
| merge (duplicates) | zusammenführen | |
| duplicate | Duplikat | |
| subscribe / follow | abonnieren / folgen | |
| notifications | Benachrichtigungen | |
| screenshot | Screenshot | |
| attachment | Anhang | |
| import / export | Import / Export; importieren / exportieren | |
| custom domain | eigene Domain | |
| source-available | Quellcode verfügbar (Source-available, FSL) | NEVER „quelloffen“/„Open Source“. |
| licence | Lizenz | |
| plan (pricing) | Tarif | „Plan“ kept in export column (customer plan from CRM) → „Tarif“ too. |
| invoice | Rechnung | |
| AI | KI | „mit KI geschrieben“. |

## Route stops
| Key | German |
|---|---|
| Suggested (open) | Vorgeschlagen |
| Planned | Geplant |
| In progress | In Arbeit |
| Shipped | Umgesetzt |
| Declined | Abgelehnt |
| Received (new) | Eingegangen |
| Confirmed | Bestätigt |
| Fixed | Behoben |
| Verified | Verifiziert |
| Won’t fix | Wird nicht behoben |

„In Arbeit“ is the idiomatic German status for in-progress work (Jira/Linear DE); the Slovak „V práci“ rule does not
transfer. Shipped = „Umgesetzt“ (not „Veröffentlicht“/„Ausgeliefert“): „veröffentlichen“ is already used for moderation
(approving = publishing a post) and for publishing a changelog entry, so „Veröffentlicht“ as a status would collide
(„Idee veröffentlicht“ toast vs. shipped). „Umgesetzt“ = implemented, reads naturally for ideas („Ihre Idee wurde umgesetzt“).
Verb: „umsetzen“ for shipping an idea; „veröffentlichen“ only for posts/comments/updates.
Author = „Verfasser“ in short labels/columns, „verfassende Person“ in prose; reporter = „meldende Person“.
Plan (pricing) = „Tarif“; the plan names Free/Pro/Studio stay untranslated. Workspace stays „Workspace“.
Sample/placeholder data localised for DACH: Xero → DATEV, VAT number → USt-IdNr., accents → Umlaute, yourcompany.com → ihrefirma.de.

## Keys for native review
- route.label.shipped / roadmap / slack.status.shipped – „Umgesetzt“ chosen (see above); confirm vs. „Ausgeliefert“.
- account.invite.invitesYou / as / roleAs.* / signInAs / created – sentence assembled from fragments in invite/page.tsx;
  rendered as „<Name> lädt Sie ein. Ihre Rolle: Mitglied. Sie werden angemeldet als x@y – falls …“. Check flow.
- email.onBug / onIdea / commentSummary / noteSummary / commentLead / commentQueued* – „{where}“ is „zur Meldung #n“ / „zur Idee“;
  composed sentences („hat einen Kommentar zur Idee „X“ geschrieben“).
- integrations.gh.provenance + gh.trust.* + gh.source.* – dative/accusative fragments („verfasst von einer … über das Board“).
- integrations.insight.heading + insight.source.* – „Kundenerkenntnis aus einem Telefonat“; „Kundenerkenntnis“ may want a better term.
- admin.login.maskA/maskB, admin.integrations.mcpA–C, admin.limits.mailOffA–C, admin.people.textA/B, admin.tokens.codeA/B,
  forms.privacy.typeToConfirm – fragments around <code>; check word order in context.
- integrations.people.roles.member („Nutzer“), board.user, board.customers.anonymous – generic masculine kept for brevity.
- moderation.blockAuthor/unblockAuthor („Verfasser sperren“) – generic masculine in a short menu item.
- forms.vote.level1–3 („Wäre schön“, „Wichtig“, „Entscheidend“) – importance labels.
- import.fider.fileHint / keyHint / errors.fiderBackup / fiderKey – Fider menu paths kept in English (Administration → Export → Backup,
  My settings → API key); Fider has a German UI – verify the actual German menu labels if desired. Canny paths kept English (Canny is EN-only).
- integrations.github.hookA/hookB, tokenHint – GitHub UI labels kept in English (GitHub UI is English).
- board.journey.inVersion „ in v{v}“ identical to English (intended).

## Market-specific content (adapt for DACH)
- account.legalNote – „Rechtsverbindlich ist die slowakische Fassung dieses Dokuments.“ (translated faithfully; legal decision).
- a11y.page.enforcement – cites Slovak Act 351/2022 and Czech Act 424/2023 only. For DE/AT consider BFSG (Germany, Marktüberwachung
  der Länder / MLBF) and BaFG (Austria, Sozialministeriumservice). Not added without legal review.
- a11y.page.feedback – 5 working days promise; same as source.
- export.menu.semicolonHint – changed to „Excel auf Deutsch, Slowakisch, Tschechisch und in den meisten europäischen Sprachen“ (German Excel uses ;).
- landing.pricing.lede, console.plan.vat – „Preise zzgl. MwSt.“; Creem as merchant of record.
- landing.story.stage.lines / url / report, playground.board.* – demo invoice data localised (EUR format 1.200,00 €, Umlaute bug).
- forms.newItem.placeholder*, forms.changelog.titlePlaceholder, admin.theme.sample – DATEV instead of Xero, USt-IdNr. instead of VAT number.
- No key in en.json lists Ozvi’s supported languages, so nothing needed for the „SK, CZ, EN, PL, HU, DE“ rule.
