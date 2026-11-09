# Migrácia z Fideru

Fider sa importuje cez ten istý engine ako CSV a Canny: najprv náhľad (nič sa neuloží), potom import na pozadí s priebehom. Nikomu nejde e-mail ani webhook, opakovaný import prenesie len to, čo vo Fideri pribudlo (kľúčom sú id z Fideru), a celý beh sa dá vrátiť späť v Admin → Import.

## V admine (odporúčané)

Admin → Import → **Fider**, dve možnosti:

- **Záloha z Fideru** — vo Fideri Administrácia → Export → Záloha (`backup.zip`, JSON po tabuľkách). Obsahuje všetko vrátane e-mailov, prihlasovacích identít (`user_providers`) a príloh uložených v databáze Fideru. Najviac 25 MB.
- **Fider API** — adresa Fideru + API kľúč administrátora (Môj profil → API kľúč). Kľúč ostáva len v pamäti servera počas importu, nikde sa neukladá. V cloude adresa prechádza SSRF ochranou (`lib/net.ts`, žiadne interné adresy, žiadne presmerovania). API Fideru nevracia prílohy priamo na príspevkoch (len pri komentároch) a prihlasovacie identity len ak ich verzia Fideru posiela; na úplný prenos použite zálohu.

V náhľade vyberiete **štítok, ktorý označuje chyby** (predvolene `bug`) a **prihlásenie z vašej appky** (predvolene jediný vlastný OAuth provider, názov začína `_`, napr. `_billiwo`).

## Z príkazového riadku

```sh
# Fider databáza priamo (ako doteraz), alebo záloha, alebo API (kľúč v premennej, nie v príkaze)
DATABASE_URL=postgres://ozvi:…@host/ozvi pnpm --filter @ozvi/web import:fider --project billiwo \
  --from postgres://fider:…@host/fider [--tenant feedback] --dry-run
pnpm --filter @ozvi/web import:fider --project billiwo --backup backup.zip
FIDER_API_KEY=… pnpm --filter @ozvi/web import:fider --project billiwo --api https://feedback.billiwo.com
# voľby: --provider _billiwo, --bug-tag bug | --no-bugs, --dry-run
```

Príkaz zapíše beh do histórie importov, takže sa dá vrátiť späť z adminu.

## Čo sa prenesie

| Fider | Ozvi |
|---|---|
| post so štítkom chýb | súkromné hlásenie chyby (bez hlasov) |
| ostatné posty | nápady; **číslo ostane**, ak je na boarde voľné (inak dostane nové za najvyšším číslom z Fideru — náhľad to povie) |
| open / planned / started / completed / declined | Navrhnuté / Plánované / Rozpracované / Vydané / Zamietnuté (chyby: Prijaté / Potvrdené / Rozpracované / Opravené / Nebudeme riešiť) |
| duplicate | zlúčené do originálu (skryté zo zoznamu) |
| neschválený post (moderovanie) | vo fronte na schválenie |
| deleted posty, komentáre, používatelia | vynechané (obsah zmazaného používateľa ostane bez autora) |
| odpoveď tímu pri stave | komentár autora odpovede |
| štítky | štítky s rovnakou viditeľnosťou (verejný / len tím), farba podľa odtieňa |
| hlasy, komentáre | prenesené, počty hlasov prepočítané |
| prílohy (`blobs` v DB Fideru) | skopírované do úložiska Ozvi (kontrola typu, 10 MB, kvóta plánu); chýbajúce sa nahlásia |
| používateľ s identitou providera appky | **external id = id v appke** → prvé SSO prihlásenie trafí toho istého človeka |
| ostatní používatelia | podľa e-mailu (existujúci na boarde sa použije, nový dostane `email:<adresa>`), bez e-mailu `fider:<id>` |
| administrator / collaborator | admin / tím (len noví ľudia; existujúcim sa rola nemení) |
| odhlásený z e-mailov | `email_opt_out` |

**Overené** testami `apps/web/src/lib/import-fider.test.ts` (záloha zo zipu, API cez falošný Fider, rovnaké id oboch ciest, opakovaný import po pridaní nového postu, vrátenie späť vrátane súborov) a prehliadačom proti lokálnemu falošnému Fider API. Fixture `apps/web/src/lib/import/fixtures/fider-backup/`; pôvodná `apps/web/scripts/fixtures/fider-sample.sql` je reálna schéma `getfider/fider:stable` pre `--from`.

**Pred migráciou produkcie:** Fider v0.37 opravil cross-tenant prevzatie loginu — ak migrácia nebude hneď, aktualizujte Fider.
