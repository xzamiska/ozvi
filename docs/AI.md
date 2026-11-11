# AI v Ozvi a označovanie (AI Act, čl. 50)

Ozvi používa AI len ako pomocníka tímu. Pravidlo vlastníka: **AI text je vždy návrh, ktorý schváli človek.** Nič, čo napísala AI, neodíde k používateľom bez toho, aby to niekto z tímu prečítal a zverejnil.

Povinnosti transparentnosti podľa článku 50 nariadenia (EÚ) 2024/1689 (AI Act) platia od 2. 8. 2026. Ozvi ich plní tak, že každý výstup AI je viditeľne označený a nesie aj strojovo čitateľné označenie.

## Kde AI píše

| Funkcia | Kto to vidí | Schválenie | Viditeľné označenie | Strojovo čitateľné |
|---|---|---|---|---|
| Návrh novinky (tlačidlo „Navrhnúť text pomocou AI“ alebo automaticky z GitHub release) | tím, po zverejnení všetci | zverejnenie novinky = schválenie, zverejňujúci sa uloží ako kontrolór | „s pomocou AI · skontroloval/a Meno“ pri novinke (board, RSS); v koncepte „Návrh od AI · čaká na kontrolu“ | `ai` v `changelog.published` webhooku, MCP `list_updates`, exporte projektu |
| Zhrnutie diskusie | len tím, neukladá sa | nikam sa nezverejňuje | „Napísala AI · overte si to v diskusii“ | — (neopúšťa Ozvi) |
| Týždenný prehľad pre tím | len tím (e-mail) | výnimka: interný e-mail tímu | veta „Zhrnutie napísala AI…“, odkazy odstránené | — |
| Podobné záznamy (duplicity) cez embeddingy | len tím | o zlúčení rozhoduje človek (s potvrdením) | „Podobné záznamy vybral model AI…“ | `ai` pri výsledkoch MCP `find_duplicates` |
| Preklad príspevkov na boarde (nápady, komentáre, novinky; nastavenie Jazyky → Preklad príspevkov: vypnutý / na požiadanie / automaticky) | čitateľ, ktorý smie vidieť originál | výnimka: strojový preklad cudzieho textu, nie text tímu; originál je vždy na jedno kliknutie | „Preložené s pomocou AI · zobraziť originál“ pri každom preloženom príspevku, model v popise | `data-ai-generated="true"` a `data-ai-model` v HTML; v cache `content_translations.model` |
| Anglické „pivoty“ názvov nápadov (hľadanie duplicít naprieč jazykmi) | nikto ich nevidí, len sa podľa nich hľadá | — | — (zobrazujú sa originály) | — |

Podobnosť cez trigramy (bez modelu embeddingov) nie je AI a označenie nemá.

## Strojovo čitateľné pole `ai`

```json
"ai": { "generated": true, "model": "claude-opus-5-5", "reviewedBy": "Eva Nováková", "reviewedAt": "2026-11-08T10:00:00.000Z" }
```

- `null` (alebo vo webhooku `{ "generated": false }`) = text napísali ľudia.
- `reviewedBy: null` = koncept, ešte ho nikto neschválil.
- Novinka, pri ktorej tím použil AI návrh, nesie označenie aj po ľubovoľných úpravách (`changelog_entries.ai_model`). Kontrolór je ten, kto novinku zverejnil (`reviewed_by_id`, `reviewed_at`).

Agenti a integrácie, ktoré tieto dáta preberajú, nesmú AI text vydávať za text tímu.

## Údaje, ktoré idú modelu

- Text od používateľov ide modelu len ako dáta vo `<feedback>` (JSON, `<` escapované); systémový pokyn hovorí, že ide o dáta, nie inštrukcie.
- Návrh novinky z release dostane nápady (názov, text, hlasy), poznámky k vydaniu z GitHubu a názvy PR. **Názvy súkromných hlásení chýb nie, len ich počet.** Zoznam položiek s odkazmi pripojí Ozvi, nie model.
- Cloud: AI len v plánoch s `ai`, model Claude (Anthropic). Self-host: len s nastaveným poskytovateľom (`OZVI_AI_PROVIDER`, pozri nižšie). Bez neho všetko funguje bez AI (návrh novinky z release je potom šablóna).

## Poskytovateľ modelu

Ozvi nie je viazané na jedného poskytovateľa (`apps/web/src/lib/ai-provider.ts`). Nastavuje ho len prevádzkovateľ servera cez prostredie, nikdy projekt ani používateľ (adresa API je dôveryhodná konfigurácia).

| Premenná | Význam |
|---|---|
| `OZVI_AI_PROVIDER` | `anthropic` (oficiálne SDK) · `openai` (ľubovoľné API kompatibilné s OpenAI: OpenAI, Mistral, Azure OpenAI, OpenRouter, Groq, Ollama, vLLM, LM Studio) · `off` |
| `OZVI_AI_API_KEY` | kľúč; pri lokálnych serveroch (Ollama…) môže chýbať |
| `OZVI_AI_BASE_URL` | predvolene `https://api.anthropic.com` / `https://api.openai.com/v1` |
| `OZVI_AI_MODEL` | pri `openai` povinný; pri `anthropic` predvolene `claude-opus-5-5` |
| `OZVI_AI_MODEL_FAST` | voliteľný lacnejší model na preklady a anglické pivoty (inak `OZVI_AI_MODEL`) |

- **Spätná kompatibilita:** samotný `ANTHROPIC_API_KEY` = `anthropic` (v logu raz upozornenie, že je zastaraný).
- **OpenAI-kompatibilná cesta:** `POST {base}/chat/completions`, timeout 90 s. Preklady chcú JSON: najprv `response_format: json_schema`, ak ho server nepozná (400/422) tak `json_object`, nakoniec obyčajný text; odpoveď sa vždy overí (zod), z textu sa toleruje aj JSON v ```` ``` ```` bloku. Bloky `<think>` lokálnych modelov sa zahodia.
- **Chyby:** 401/403 = zlý kľúč, 429/503 = preťažené, iné = zlyhanie s kódom, neplatná odpoveď = prázdna odpoveď (nikdy pád). Odmietnutie (`refusal`, `content_filter`) = odmietnuté.
- **Označenie:** pole `model` v `ai` (webhooky, MCP, export, odznak „s pomocou AI“, `data-ai-model`) je skutočné id nastaveného modelu, napr. `claude-opus-5-5`, `gpt-4o-mini`, `mistral-small-latest`; preklady nesú id rýchleho modelu.
- **Embeddingy** (duplicity) majú vlastné `OZVI_EMBEDDINGS_URL` + `OZVI_EMBEDDINGS_MODEL` (+ `_KEY`). Pri `OZVI_AI_PROVIDER=openai` stačí `OZVI_EMBEDDINGS_MODEL`: použije sa adresa a kľúč AI poskytovateľa.
- **Ochrana osobných údajov:** poskytovateľ modelu je subdodávateľ prevádzkovateľa inštancie (lokálny model = žiadny). Verejná stránka `/subprocessors` popisuje cloud (Anthropic).

## Preklad príspevkov

- Zapína admin v Jazyky → Preklad príspevkov (`projects.translation_mode`: `off` | `on_demand` | `auto`), funguje len s AI (plán s `ai` alebo nastavený `OZVI_AI_PROVIDER`).
- Jazyk príspevku odhadne Ozvi bez modelu (`lib/lang-detect.ts`); tlačidlo „Preložiť“ sa ukáže len pri príspevku v inom jazyku, než v akom čitateľ board číta.
- **Oprávnenia** (`lib/translate.ts`, server): modelu ide len text, ktorý čitateľ smie vidieť – hlásenie chyby len reportérovi a tímu, poznámky tímu len tímu, čakajúce príspevky len autorovi a tímu, koncepty noviniek len tímu, zmazané nikomu. Pri zmazaní príspevku alebo komentára sa zmažú aj jeho preklady.
- **Cache** `content_translations` podľa (príspevok, sha256 textu = verzia, cieľový jazyk): každá verzia sa prekladá raz; úprava textu = nová verzia.
- **Náklady**: limit 60 nových prekladov za hodinu na čitateľa (prihlásený používateľ alebo IP) a mesačný počet nových prekladov na pracovný priestor podľa plánu (Free 0, Pro 500, Studio 2 000; vlastný hosting bez limitu, `OZVI_TRANSLATE_MONTHLY_CAP` ho nastaví), najviac 12 000 znakov na príspevok; preklady z cache sa nepočítajú.
- **Modely bez uvažovania.** `OZVI_AI_MODEL` (súhrny, koncepty noviniek, prehľad) aj `OZVI_AI_MODEL_FAST` (preklady) majú byť inštrukčné modely bez „reasoning“. Uvažujúce modely (napríklad `qwen3.8-27b`) minú limit tokenov na skryté uvažovanie a odpoveď je orezaná alebo prázdna; Ozvi takú odpoveď odmietne a zapíše varovanie do logu. Na Scaleway odporúčame `mistral-small-3.2-24b-instruct-2506` pre oba.
- **Model na preklady**: `OZVI_AI_MODEL_FAST`. Stačí malý inštrukčný model bez uvažovania (napríklad `mistral-small-3.2-24b-instruct-2506` na Scaleway); uvažujúce modely minú na krátky preklad niekoľkonásobne viac výstupných tokenov.
- **Duplicity naprieč jazykmi**: worker raz za minútu preloží názvy verejných nápadov (nie hlásení chýb) do angličtiny (`target_locale = "en:title"`); hľadanie podobných nápadov pri písaní a „Podobné záznamy“ pre tím ich porovnávajú s originálmi aj s anglickou verziou písaného názvu. S embeddingmi (viacjazyčný model) to funguje aj bez pivotov.

