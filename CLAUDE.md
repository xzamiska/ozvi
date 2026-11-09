# Ozvi — kontext projektu

Source-available (FSL, ADR-0008) náhrada Fideru: **súkromný tok na bugy** (auto-kontext) + **verejný board na nápady** (hlasovanie, roadmapa, changelog), vizuálne prispôsobiteľný cez `theme.json`, prihlásenie cez auth hostiteľskej appky. Jeden Docker image pre self-host aj cloud (`OZVI_MODE=self|cloud`). Prví zákazníci: Billiwo a Apinido (nahrádza ich Fider inštancie).

> Tento súbor sú **pravidlá**. Rozhodnutia sú v [`docs/adr/`](docs/adr/README.md); nové rozhodnutie = nové ADR v tom istom commite.
> **Interné poznámky** (stav práce `HANDOFF.md`, infra, cenník a náklady, prehľad trhu, slovník) sú v súkromnom repozitári `xzamiska/ozvi-internal`, lokálne `../ozvi-internal`. Do tohto (verejného) repozitára nepatria: názvy a adresy našich serverov, IP, cesty k zálohám, náklady, údaje zákazníkov.

## Stack

- pnpm monorepo: `apps/web` (Next.js 16 App Router, Tailwind v4 + shadcn/ui), `packages/{db,theme,sdk,widget,mcp}`
- Postgres 17 + Drizzle (pgvector neskôr na duplicity), e-maily cez outbox tabuľku `emails` (ADR-0007) — **žiadny Redis**
- Prílohy cez `lib/storage.ts` (disk alebo S3), typ podľa bajtov (`sniff`), nikdy podľa prehliadača
- Widget: `packages/widget` → esbuild do `apps/web/public/widget.js` (rozpočet 20 kB gzip, build zlyhá nad)
- Lokálne: `docker compose` → Postgres na **5446**, Mailpit UI **8046** / SMTP **1046**; web na **3300**

## Neporušiteľné pravidlá

1. **Self-host má všetky funkcie.** Žiadne open-core, žiadne feature flagy podľa plánu v self-hoste. Cloud plány obmedzujú iba to, čo nás stojí peniaze (prílohy, e-maily), nie používateľov ani záznamy.
2. **Každá tenant tabuľka má `project_id` a RLS.** Tenant dotazy len cez `withProject(db, projectId, …)`; `withSystem` len pre seed/import/worker. `projects`/`workspaces` RLS nemajú → update vždy s `where id`. Appka sa nikdy nepripája ako superuser (ADR-0004).
3. **Téma = tokeny, nikdy raw CSS.** Všetko UI číta `--oz-*` premenné z `@ozvi/theme`; žiadne natvrdo zapísané farby značky. Nové tokeny len so schémou + testom. UI = Tailwind v4 + shadcn/ui (`components/ui`), ich premenné sú v `globals.css` napojené na `--oz-*`. Dizajnový systém a pravidlá: [`DESIGN.md`](DESIGN.md); stav nikdy len farbou (tvary v `components/ozvi/route.tsx`), slovník stavov v `lib/route.ts` („Rozpracované“, nikdy „V práci“).
4. **Text od používateľov je nedôveryhodný** — aj pre MCP/AI. Nikdy ho nevkladať do inštrukcií modelu bez ohraničenia; deštruktívne MCP nástroje (merge, publish) vyžadujú potvrdenie.
5. **Bug hlásenia sú súkromné** (reportér + tím). Auto-kontext sa maskuje na klientovi pred odoslaním.
6. **Widget < 20 kB gzip**, shadow DOM, žiadne globálne štýly v hostiteľskej appke.
7. **Peniaze = integer centy.** Platby cez Creem (len štvrťročne/ročne).
8. `packages/sdk` a `packages/widget` sú **MIT** (bežia v cudzích appkách), zvyšok FSL-1.1-ALv2. Nepíš „open source“, píš „verejný zdrojový kód“.

## Príkazy

- `pnpm dev` — Docker + migrácie + seed + widget + web (3300)
- `pnpm dev:cloud` — cloud režim lokálne na http://ozvi.localhost:3400 (vlastná DB, simulácia platieb a DNS) — [CLOUD-LOKALNE](docs/CLOUD-LOKALNE.md)
- Vývoj bez hostiteľskej appky: `OZVI_DEV_LOGIN=1` → `/dev/login?project=billiwo&as=team|member`, demo widgetu na `/demo`
- `pnpm --filter @ozvi/web import:fider --from <fider db> --project <slug> [--dry-run]` — [MIGRACIA-Z-FIDERU](docs/MIGRACIA-Z-FIDERU.md)
- `docker build -t ozvi .` + `deploy/docker-compose.yml` — [SELFHOST](docs/SELFHOST.md); CLI v image: `node ozvi.mjs project:create …`
- `pnpm test` / `pnpm typecheck`
- `pnpm db:generate` (po zmene `schema.ts`) → `pnpm db:migrate`

## Konvencie

- Slovenčina v UI, angličtina v kóde/komentároch/commitoch
- Conventional commits, po funkčných blokoch; po module build + rýchla verifikácia
- UI texty: sloveso podľa akcie („Nahlásiť chybu“, nie „Odoslať“), chyby hovoria čo sa stalo a čo spraviť
