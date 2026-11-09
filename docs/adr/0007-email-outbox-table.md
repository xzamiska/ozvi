# 0007 — E-maily cez outbox tabuľku namiesto pg-boss

**Stav:** prijaté 2026-11-05 (mení ADR-0003 v časti „pg-boss na joby“)

**Rozhodnutie.** Tabuľka `emails` je zároveň front, log aj počítadlo mesačného limitu. Notifikácie sa zapisujú v tej istej transakcii ako zmena, ktorá ich spôsobila (rollback = žiadny e-mail). Worker beží v procese webu (`instrumentation.ts`), berie riadky cez `FOR UPDATE SKIP LOCKED`, pri chybe opakuje s exponenciálnym odstupom (max 5×). Nad limitom plánu sa riadky označia `deferred` a raz denne odídu ako jeden súhrn na používateľa.

**Prečo.** Jediný typ jobu (e-mail) nepotrebuje knižnicu; jedna tabuľka dáva limit, audit aj retry zadarmo. Bezpečné aj pri viacerých replikách.

**Kedy prehodnotiť.** Keď pribudnú ďalšie typy jobov (AI súhrny, webhooky) — vtedy pg-boss.
