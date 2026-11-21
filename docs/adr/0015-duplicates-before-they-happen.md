# 0015 Duplicates before they happen: suggestions while writing, attach to an existing item, known issues

**Status:** accepted 2026-11-21

**Context.** Duplicates split votes and the "who is affected" count, and cost the team triage time. The team already gets similar items (`findSimilar`: pgvector embeddings when configured, otherwise trigram similarity on `ozvi_fold` text, plus English title pivots across languages). The person writing a new idea saw a different, simpler matcher (word prefixes, `/[project]/search`), so the author and the team were shown different "similar" items; clicking a suggestion also lost the draft (QA round 20 Nov 2026). Bug reports are private (CLAUDE.md rule 5): a reporter can never see other people's reports.

**Decision.**
- **One matcher.** Suggestions while writing, the team's "Podobné" panel, MCP `find_duplicates` and insights all use `findSimilar`. Two thresholds per method: a low one for the list shown while writing (recall), a high one for the question asked on submit (precision). Thresholds are constants in `lib/similar.ts`, calibrated on real merged pairs (phase 2).
- **Ideas, while writing:** up to 3 similar ideas under the title with status and votes; "Pridať hlas" works in place; opening one never loses the draft. After voting there, the author can turn their text into a comment on that idea.
- **Ideas, on submit:** only for a strong match the author has not interacted with, the form asks once: "Pridať hlas a môj popis k #N" (vote + the text as their comment; they follow it) or "Je to niečo iné" with an optional one-line reason. Never blocks, never asks twice for the same draft.
- **Created anyway:** the new idea stores what its author was shown and their reason (`items.context.similarSeen`); the team sees "Autor videl #N a označil to za iné" before merging.
- **Bugs, known issues (phase 3):** the team can publish a bug as a known issue with a public title written or approved by a person (the original text may hold customer data). Only known issues are matched for reporters. "Mám ten istý problém" creates the reporter's own report with its context, already merged into the known issue; the reporter follows it (fix e-mail, "Funguje vám to?").
- **Undo:** the team can split a merged item ("Oddeliť"). Votes moved to the original stay there.
- **Model:** a small local multilingual embedding model may run inside Ozvi (no data leaves the server, no cost per call), so similarity by meaning can be on for every plan and every self-host; it ships only if it beats trigrams on real merged pairs (phase 2). An external embeddings API stays possible (`OZVI_EMBEDDINGS_*`). No generative model decides about duplicates.
- **Measurement:** only aggregate counts (shown, attached, created anyway, merged later, split), for thresholds and a "duplicates avoided" figure for the team.

**Rejected.**
- *Public bug reports.* Breaks rule 5 and the promise to reporters; known issues give the same benefit with team-approved text.
- *Blocking the form until the author picks an existing item.* People with a genuinely different need would leave or force a wrong match.
- *An LLM judging "same or not" on every submit.* Latency, cost and a generative model deciding about people's input; embeddings plus thresholds are enough.

**Consequences.** `/[project]/search` returns `findSimilar` results (with scores) instead of word-prefix matches; the team and the author see the same candidates. Attaching creates a vote and a comment through the normal paths (rate limits, approval queue, budgets of importance voting apply). Known issues add a public surface for bugs that is opt-in per bug and always human-written.
