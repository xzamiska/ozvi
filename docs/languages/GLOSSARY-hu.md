# Ozvi – magyar szójegyzék (hu)

## Register
- Tegező, barátságos-szakmai hang (ahogy a Google, Microsoft, Spotify magyar felülete). Következetesen: „Válaszd ki…”, „Próbáld újra”.
- Gombok: főnévi címkék, ahol idiomatikus („Mentés”, „Mégse”, „Törlés”, „Bejelentkezés”, „Meghívás”); egyébként rövid felszólító mód („Szavazz”, „Próbáld újra”).
- Helyőrzők ({name}, {project}, {n}…) után NEM teszünk ragot (nem tudjuk a hangrendet); átfogalmazunk: „Projekt: {name}”, „a(z) {project} projekt” helyett „a(z) …” elkerülve → „{project} projekt” vagy kettőspontos szerkezet. Névelő helyőrző előtt: „a(z)” kerülendő, inkább átfogalmazunk.
- Idézőjel: „…”, belső »…«. Gondolatjel: –. Aposztróf nem kell a magyarban.
- Dátum/szám: a next-intl formázza; szövegben „e-mail” kötőjellel.

## Termékfogalmak
| EN | HU | Megjegyzés |
|---|---|---|
| board | tábla (visszajelzési tábla) | „board” a Fider/Canny-világban; a „tábla” természetes, rövid |
| feedback | visszajelzés | |
| idea | ötlet | |
| bug / bug report | hiba / hibajelentés | |
| report (generic, idea or bug) | bejelentés | ha mindkét típust jelenti; hibánál „hibajelentés” |
| roadmap | ütemterv | a „roadmap” szót nem használjuk a felületen |
| route / stop | útvonal / állomás | Ozvi-metafora: egy bejelentés útja |
| What’s new / changelog | Újdonságok | |
| release | kiadás; version = verzió | |
| vote / to vote | szavazat / szavazni | „5 szavazat” (szám után egyes szám) |
| voter | szavazó | |
| comment | hozzászólás | |
| reporter / author | bejelentő / szerző | |
| team | csapat | |
| project | projekt | |
| workspace / console | konzol | |
| admin | adminisztrátor (röv. admin a szűk helyeken) | |
| moderation | moderálás | |
| widget | widget | elterjedt magyar IT-szó |
| tag | címke | |
| sign in / sign out | bejelentkezés / kijelentkezés | |
| sign up | regisztráció | |
| e-mail | e-mail | |
| settings | beállítások | |
| import / export | importálás / exportálás | |
| integration | integráció | |
| screenshot | képernyőkép | |
| attachment | melléklet | |
| subscription / plan | előfizetés / csomag | |
| invoice | számla | |
| source-available | nyilvános forráskódú (FSL licenc) | SOHA nem „nyílt forráskódú” |
| AI | AI | A magyar SaaS-ok egyre inkább „AI”-t írnak (Google: „AI-alapú”); rövid és egyértelmű |
| token (API) | token | |
| webhook | webhook | |
| merge (duplicates) | összevonás | |
| duplicate | duplikátum / ismétlődő | |
| upvote | szavazat | |
| subscribe/follow | követés / feliratkozás | e-mailre: feliratkozás |

## Útvonal-állomások (route)
| EN | HU |
|---|---|
| Suggested | Javasolt |
| Planned | Tervezett |
| In progress | Folyamatban |
| Shipped | Elkészült |
| Declined | Elutasítva |
| Received | Beérkezett |
| Confirmed | Megerősítve |
| Fixed | Javítva |
| Verified | Ellenőrizve |
| Won’t fix | Nem javítjuk |

„Elkészült” és nem „Kiadva”, mert ötletre természetesebb (az ötlet elkészült, a verzió kiadva).

## Kiegészítések fordítás közben
| EN | HU | Megjegyzés |
|---|---|---|
| workspace | munkaterület | |
| post / item | bejegyzés | általános (ötlet vagy hiba) |
| update (changelog entry) | bejelentés / újdonság-bejegyzés | „Write an update” = „Bejelentés írása” |
| release notes | kiadási jegyzetek | |
| triage (scope) | osztályozás | |
| digest | összesítő | |
| lockdown mode | zárolt mód | |
| Nice to have / Important / Critical | Jó lenne / Fontos / Kritikus | |
| sub-status | alállapot | |
| accent (colour) | kiemelőszín | |
| issue (GitHub) | issue | GitHub nem honosított, a magyar fejlesztők is így használják |
| Unanswered | Megválaszolatlan | |
| Plan & usage | Csomag és használat | |

Helyőrző-kezelés: ragozott helyőrző helyett „…: {x}” vagy zárójeles szerkezet („a projekt visszajelzései ({name})”). Ahol névelő kell egy helyőrző előtt, a magyar szoftverekben megszokott „a(z)” formát használtuk (pl. „a(z) {version} verzióban”).

## Natív ellenőrzésre javasolt kulcsok
- `account.invite.invitesYou` / `as` / `roleAs.*` / `weInvite` – a mondat kódban darabokból áll össze („<b>Péter</b> meghív téged tulajdonosként.” / „Meghívást kaptál tagként.”); ellenőrizni a megjelenített mondatot.
- `email.onBug`, `email.onIdea`, `email.commentLead`, `email.commentSummary`, `email.noteSummary`, `email.commentQueued*` – szintén összetett mondatok ({where} beillesztéssel: „egy ötlethez”, „egy hibajelentéshez (#12)”).
- `board.customers.wantCompanies` + `andPeople` – „Igényli: 3 cég és 2 cég nélküli személy”.
- `board.journey.inVersion` – „Javítva a v2.15 verzióban” (a státuszcímke után fűződik).
- `board.item.mergedInto` + `votesMoved` – „Ez duplikátum. Itt folytatódik: #5 …; a szavazatok is átkerültek oda.”
- `admin.login.maskA/maskB/maskAnd`, `admin.integrations.mcpA/B/C`, `admin.limits.mailOffA/B/C`, `admin.people.textA/B`, `admin.tokens.codeA/codeB`, `admin.settings.sso.setA` – kóddarabok köré épülő mondatok.
- `integrations.slack.*` – Slack-üzenetsorok („Péter: új hiba: #12 …”), `{who}` már tartalmazza a kettőspontot.
- `integrations.gh.provenance` + `gh.trust.*` + `gh.source.*` – „Az Ozviból – szerző: bejelentkezett ügyfél, forrás: az alkalmazásba épített widget.”
- `email.releaseDraftBody` – plural + „Elkészült”/„Javítva” állapotnevek idézőjelben.
- `route.label.shipped` = „Elkészült” (nem „Kiadva”) – termékdöntés, megerősítendő.
- `ai.*`, `forms.changelog.aiLabel*` – „AI” vs. „MI”: az „AI” mellett döntöttünk; ha a márka a „mesterséges intelligencia / MI” formát preferálja, ezeket kell cserélni.
- `landing.dev.title` – „Egy ebédszünet alatt beköthető. Nem egy sprint alatt.” (szlogen, kreatív ellenőrzés).
- `playground.title` – „Olyan, mint az alkalmazásod. Nem olyan, mint mi.” (szlogen).
- `export.file.*` – fájlnevek ékezet nélkül (otletek, hibak…), szándékosan.

## Piacspecifikus tartalom
- `account.legalNote` – „a szlovák nyelvű változat a kötelező érvényű” – jogi döntés, a forrással egyezően meghagyva.
- `a11y.page.enforcement` – csak a szlovák (351/2022) és cseh (424/2023) törvényt említi; a magyar akadálymentességi jogszabály (az EAA hazai átültetése) és a magyar piacfelügyeleti hatóság hozzáadandó jogi ellenőrzés után.
- `export.menu.semicolonHint` – „Magyar, szlovák, cseh és a legtöbb európai Excel” (a magyar Excel is pontosvesszőt használ – hozzáadtuk).
- `import.csv.fileHint` – Windows-1250 a magyarra is érvényes (közép-európai kódlap).
- `forms.newItem.placeholderIdea`, `admin.theme.sample[0].title`, `forms.changelog.titlePlaceholder` – az angol „Xero” helyett semleges „könyvelőprogram” (Xero Magyarországon nem elterjedt).
- `forms.newItem.placeholderBug` / `bodyPlaceholderBug` – „VAT number” → „adószám”; `playground` minta – „áfabontás”.
- `landing.pricing.lede`, `console.plan.vat` – „áfa”.
- `playground.board.*`, `landing.story.stage.*` – magyar nevek, dátumformátum („nov. 4.”), pénznemformátum („1 200,00 €”), példadomain „visszajelzes.ceged.hu”.
- Nyelvlista: az en.json-ban nincs olyan kulcs, amely felsorolná az Ozvi által támogatott nyelveket (a `semicolonHint` kivételével, amely Excel-lokalizációról szól).
