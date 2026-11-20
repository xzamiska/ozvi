# AI in Ozvi and labelling (AI Act, Art. 50)

Ozvi uses AI only as a helper for the team. The owner's rule: **AI text is always a draft that a person approves.** Nothing written by AI reaches users without someone on the team reading and publishing it.

The transparency obligations under Article 50 of Regulation (EU) 2024/1689 (AI Act) apply from 2 August 2026. Ozvi meets them by labelling every AI output visibly and also giving it a machine-readable label.

## Where AI writes

| Feature | Who sees it | Approval | Visible label | Machine-readable |
|---|---|---|---|---|
| Update draft (the “Draft text with AI” button, or automatically from a GitHub release) | the team; everyone once published | publishing the update = approval; the publisher is saved as the reviewer | “written with AI · reviewed by Name” on the update (board, RSS); in a draft “AI draft · waiting for review” | `ai` in the `changelog.published` webhook, MCP `list_updates`, the project export |
| Discussion summary | team only, not saved | not published anywhere | “Written by AI · check it against the discussion” | — (never leaves Ozvi) |
| Weekly digest for the team | team only (e-mail) | exception: internal team e-mail | the sentence “This summary was written by AI…”, links removed | — |
| Similar items (duplicates) via embeddings | team only | a person decides on merging (with confirmation) | “An AI model picked these by meaning…” | `ai` on MCP `find_duplicates` results |
| Translation of posts on the board (ideas, comments, updates; setting Languages → Post translation: Off / On request / Automatic) | a reader who is allowed to see the original | exception: machine translation of someone else's text, not the team's text; the original is always one click away | “Translated with AI · show original” on every translated post, model in the description | `data-ai-generated="true"` and `data-ai-model` in the HTML; in the cache `content_translations.model` |
| English “pivots” of idea titles (finding duplicates across languages) | nobody sees them, they are only used for searching | — | — (originals are shown) | — |

Similarity via trigrams (without an embeddings model) is not AI and carries no label.

## The machine-readable `ai` field

```json
"ai": { "generated": true, "model": "claude-opus-5-5", "reviewedBy": "Eva Nováková", "reviewedAt": "2026-11-08T10:00:00.000Z" }
```

- `null` (or `{ "generated": false }` in the webhook) = the text was written by people.
- `reviewedBy: null` = a draft that nobody has approved yet.
- An update for which the team used an AI draft keeps the label after any edits (`changelog_entries.ai_model`). The reviewer is whoever published the update (`reviewed_by_id`, `reviewed_at`).

Agents and integrations that take this data must not pass AI text off as the team's text.

## Data sent to the model

- Text from users goes to the model only as data inside `<feedback>` (JSON, `<` escaped); the system prompt says it is data, not instructions.
- An update draft from a release gets the ideas (title, text, votes), the release notes from GitHub and the PR titles. **Not the titles of private bug reports, only their count.** The list of items with links is added by Ozvi, not by the model.
- Cloud: AI only on plans with `ai`, model Claude (Anthropic). Self-hosted: only with a provider configured (`OZVI_AI_PROVIDER`, see below). Without one everything works without AI (an update draft from a release is then a template).

## Model provider

Ozvi is not tied to a single provider (`apps/web/src/lib/ai-provider.ts`). Only the server operator sets it, through the environment, never a project or a user (the API address is trusted configuration).

| Variable | Meaning |
|---|---|
| `OZVI_AI_PROVIDER` | `anthropic` (official SDK) · `openai` (any OpenAI-compatible API: OpenAI, Mistral, Azure OpenAI, OpenRouter, Groq, Ollama, vLLM, LM Studio) · `off` |
| `OZVI_AI_API_KEY` | key; may be missing for local servers (Ollama…) |
| `OZVI_AI_BASE_URL` | defaults to `https://api.anthropic.com` / `https://api.openai.com/v1` |
| `OZVI_AI_MODEL` | required for `openai`; for `anthropic` defaults to `claude-opus-5-5` |
| `OZVI_AI_MODEL_FAST` | optional cheaper model for translations and English pivots (otherwise `OZVI_AI_MODEL`) |
| `OZVI_AI_REASONING_EFFORT` | OpenAI-compatible only: sent as `reasoning_effort`, e.g. `none` so reasoning models (DeepSeek V4 flash, Qwen 3.8) answer without hidden thinking; if the server rejects it, Ozvi logs a warning and sends requests without it |

- **Backward compatibility:** `ANTHROPIC_API_KEY` on its own = `anthropic` (a one-time warning in the log that it is deprecated).
- **OpenAI-compatible path:** `POST {base}/chat/completions`, 90 s timeout. Translations want JSON: first `response_format: json_schema`; if the server does not know it (400/422), then `json_object`; finally plain text. The response is always validated (zod); in plain text, JSON in a ```` ``` ```` block is also accepted. `<think>` blocks from local models are discarded.
- **Errors:** 401/403 = wrong key, 429/503 = overloaded, anything else = failure with the code, invalid response = empty response (never a crash). A refusal (`refusal`, `content_filter`) = refused.
- **Labelling:** the `model` field in `ai` (webhooks, MCP, export, the “written with AI” badge, `data-ai-model`) is the actual id of the configured model, e.g. `claude-opus-5-5`, `gpt-4o-mini`, `mistral-small-latest`; translations carry the id of the fast model.
- **Embeddings** (duplicates) have their own `OZVI_EMBEDDINGS_URL` + `OZVI_EMBEDDINGS_MODEL` (+ `_KEY`). With `OZVI_AI_PROVIDER=openai`, `OZVI_EMBEDDINGS_MODEL` is enough: the AI provider's address and key are used.
- **Data protection:** the model provider is a sub-processor of the instance operator (local model = none). The public `/subprocessors` page describes the cloud (Anthropic).

## Post translation

- An admin turns it on in Languages → Post translation (`projects.translation_mode`: `off` | `on_demand` | `auto`); it works only with AI (a plan with `ai` or `OZVI_AI_PROVIDER` configured).
- Ozvi guesses the language of a post without a model (`lib/lang-detect.ts`); the “Translate” button appears only on a post in a language other than the one the reader is reading the board in.
- **Permissions** (`lib/translate.ts`, server): only text the reader is allowed to see goes to the model – a bug report only to the reporter and the team, team notes only to the team, pending posts only to the author and the team, update drafts only to the team, deleted ones to nobody. When a post or comment is deleted, its translations are deleted too.
- **Cache** `content_translations` keyed by (post, sha256 of the text = version, target language): each version is translated once; editing the text = a new version.
- **Costs**: a limit of 60 new translations per hour per reader (signed-in user or IP) and a monthly number of new translations per workspace according to the plan (Free 0, Pro 500, Studio 2,000; self-hosted without a limit, `OZVI_TRANSLATE_MONTHLY_CAP` sets one), at most 12,000 characters per post; translations from the cache do not count.
- **Models without reasoning.** Both `OZVI_AI_MODEL` (summaries, update drafts, digest) and `OZVI_AI_MODEL_FAST` (translations) should answer without “reasoning”. Reasoning models (for example `deepseek-v4-flash`, `qwen3.8-27b`) otherwise use up the token limit on hidden reasoning and the response is cut off or empty; Ozvi rejects such a response and writes a warning to the log. Either pick an instruction model or set `OZVI_AI_REASONING_EFFORT=none` if the server supports it (Scaleway does for DeepSeek and Qwen).
- **Model for translations**: `OZVI_AI_MODEL_FAST`. A small instruction model without reasoning is enough (for example `mistral-small-3.2-24b-instruct-2506` on Scaleway); reasoning models use several times more output tokens on a short translation.
- **Duplicates across languages**: once a minute a worker translates the titles of public ideas (not bug reports) into English (`target_locale = "en:title"`); the similar-ideas search while typing and the team's “Duplicates” panel compare them with the originals and with the English version of the title being typed. With embeddings (a multilingual model) this works even without pivots.
