# Ozvi — Polish (pl) glossary and register

## Register
- Second person singular, modern Polish SaaS tone (like Linear/Vercel/Notion PL): „Zaloguj się”, „Twoje konto”, „Wybierz…”.
- Possessives Twój/Twoja/Twoje lower-case („twoje”) in UI labels and running text; never Pan/Pani, never „Państwo”.
- Buttons/labels: imperative 2nd sg („Zapisz”, „Usuń”, „Wyślij”) or nouns. Status labels: impersonal/participial („Zapisano”, „Wysłano”).
- The team speaks as „my” (1st pl) like the Slovak source („Damy ci znać”).
- Quotes „…”, en dash – with spaces, ellipsis …, typographic apostrophe ’.
- Non-breaking space after one-letter prepositions/conjunctions is NOT inserted (UI strings are short; rendering handles it).

## Fixed terms
| EN | PL | Note |
|---|---|---|
| board | tablica | „tablica pomysłów”, „tablica publiczna” |
| idea | pomysł | |
| bug report / bug | zgłoszenie błędu / błąd | „zgłoszenie” alone when context is clear |
| report (verb, bug) | zgłosić | |
| feedback | opinie / feedback | prefer „opinie”; „feedback” acceptable in marketing where natural |
| roadmap | roadmapa | standard in PL SaaS |
| changelog / What's new | Nowości | changelog entry = „wpis w Nowościach” / „wpis” |
| release | wydanie | |
| vote / to vote / voter | głos / głosować / głosujący | |
| comment | komentarz | |
| Suggested | Zaproponowane | route stop for ideas |
| Planned | Zaplanowane | |
| In progress | W realizacji | NOT „W pracy” |
| Shipped | Wdrożone | |
| Declined | Odrzucone | |
| Received | Przyjęte | |
| Confirmed | Potwierdzone | |
| Fixed | Naprawione | |
| Verified | Zweryfikowane | |
| Won’t fix | Nie będziemy naprawiać | |
| workspace | przestrzeń robocza | groups projects; billing unit |
| project | projekt | one board for one app |
| admin console | konsola administracyjna / konsola | |
| sign in / sign out | zaloguj się / wyloguj się | |
| sign up | załóż konto / zarejestruj się | |
| e-mail | e-mail | |
| screenshot | zrzut ekranu | |
| widget | widżet | |
| embed | osadzić | |
| tag | tag | |
| merge (duplicates) | scalić | |
| moderation | moderacja | |
| import / export | import / eksport | |
| settings | ustawienia | |
| subscription / plan | subskrypcja / plan | |
| invoice | faktura | |
| custom domain | własna domena | |
| source-available | z dostępnym kodem źródłowym | never „open source” |
| AI | AI (sztuczna inteligencja) | „napisane z pomocą AI · sprawdził(a) {name}” |
| token (API) | token | |
| webhook | webhook | |
| owner / admin / member | właściciel / administrator / członek zespołu | |

## Plurals
pl CLDR: one (1), few (2–4, 22–24…), many (0, 5–21, 25…), other (fractions). Every plural has one/few/many/other.

## Gender-neutral 2nd person
Polish past tense/adjectives are gendered (zalogowałeś/zalogowałaś). Prefer neutral constructions: present/future tense,
impersonal „-no/-to” forms („Wysłano”, „Potwierdzono”), nouns, or rephrasing. Where unavoidable, masculine default is not used;
use rephrasing instead. Third-person references to named people use „(a)” only in AI badge („sprawdził(a) {name}”).

## Additional term decisions made while translating
| EN | PL | Note |
|---|---|---|
| route / stop | ścieżka / etap | „etap {n} z {of}” |
| sub-status | podstatus | |
| triage (scope) | triaż | established in PL support/QA jargon; alternative „Segregacja” |
| issue (GitHub) | issue (neuter) | GitHub UI term kept |
| release note(s) | informacje o wydaniu | |
| update (changelog entry) | aktualizacja | |
| digest | podsumowanie (dzienne/tygodniowe) | |
| Unanswered (tab) | Bez odpowiedzi | |
| revoke (token) | unieważnić; (invitation) wycofać | |
| connector (MCP) | konektor | |
| Lockdown mode | tryb blokady | |
| merchant of record | merchant of record | kept in English (legal/payment term, no settled PL equivalent) |
| badge („Ozvi” badge) | plakietka | |
| Self-hosting | własny hosting | |
| Free / Pro / Studio | unchanged | plan names |
| person/people counts | osoba / osoby / osób | |

## Keys for the native reviewer (unsure / judgement calls)
- `route.label.wont_fix`, `integrations.slack.status.wont_fix` – „Nie będziemy naprawiać”: long-ish; alternative „Bez poprawki”.
- `route.label.open` – „Zaproponowane” (idea stop „Suggested”); alt. „Zgłoszone” rejected because it collides with bug reports.
- `integrations.token.triage.title`, `admin.scope.triage`, `admin.oauth.scopes.triage.title` – „Triaż”.
- `forms.vote.level1` – „Miło by było” for „Nice to have”; alt. „Przydałoby się”.
- `moderation.blockedToast`, `integrations.people.signedOut`, `admin.integrations.events/failed` – rephrased with dash/colon to avoid gendered verbs and case agreement with {name}/{n}.
- `email.commentSummary`, `email.noteSummary`, `email.commentQueuedSummary`, `email.commentQueuedLead` – structure „{who} – nowy komentarz {where} „{title}”” to avoid gendered past tense (skomentował/skomentowała).
- `email.releaseDraftBody` – restructured („oznaczyło jako wdrożone: …, a jako naprawione: …”) because Polish needs negation with „żadnych”; =0 uses „brak pomysłów/błędów”.
- `board.unanswered.*`, `email.teamDigestUnanswered`, `admin.statuses.daysSaved` – day plurals (dzień/dni/dnia) in fixed constructions, please read aloud once.
- `account.invite.*` – fragments assembled in code: „{inviter} zaprasza cię jako właściciela/członka.” / „Zapraszamy cię jako …”.
- `account.forms.name` – „Imię i nazwisko” (field for display name); `saveName` „Zapisz imię”.
- `landing.dev.title` – „Podłączysz to w przerwie na lunch. Nie w sprincie.” (marketing tone).
- `landing.hero.title` – „Opinie, które nie giną.”
- `export.file.*` – ASCII file names without diacritics (pomysly, bledy, glosujacy…) for safe downloads.
- General: gender-neutral phrasing was preferred throughout; a few role nouns stay masculine generic (zgłaszający, autor, właściciel, administrator).

## Market-specific content (adapted for Poland – please confirm)
- `account.legalNote` – „Wiążąca jest słowacka wersja tego dokumentu.” (Slovak binding version; legal decision).
- `a11y.page.enforcement` – added the Polish act (ustawa z dnia 26 kwietnia 2024 r. o zapewnianiu spełniania wymagań dostępności niektórych produktów i usług przez podmioty gospodarcze; Dz.U. 2024 poz. 731) next to the SK/CZ acts; verify title, and consider naming the Polish authority (Prezes PFRON).
- `export.menu.semicolonHint` – „Excel po polsku, słowacku, czesku i w większości Europy” (Polish Excel uses ; too).
- `forms.newItem.placeholderBug`, `bodyPlaceholderBug` – VAT number → „NIP”.
- `forms.newItem.placeholderIdea`, `forms.changelog.titlePlaceholder`, `admin.theme.sample.0.title` – Xero → „KSeF” (Polish e-invoicing system).
- `landing.story.stage.report`, `landing.dev.tabs.hook.title`, `playground.board.bugs.0.title`, `playground.board.news.0.text` – „gubi polskie znaki” (accents → Polish diacritics).
- `landing.story.stage.lines` – amounts formatted Polish-style in EUR („1200,00 €”); could be PLN for a Polish demo.
- `playground.board.ideas.*.author/comments` – demo names localised (Piotr H., Joanna T., Ewa S., Łukasz B.).
- Example domains/e-mails: opinie.twojafirma.pl, kolega@firma.pl, ty@firma.pl, app.twojafirma.pl.
- `admin.theme.sourceHint` – GDPR → „RODO”.
- `landing.pricing.lede`, `console.plan.vat` – „Ceny nie zawierają VAT.”
- No key in en.json lists the full set of UI languages, so no language list needed updating.
