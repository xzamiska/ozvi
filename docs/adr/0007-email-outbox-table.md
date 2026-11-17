# 0007 — E-mails through an outbox table instead of pg-boss

**Status:** accepted 2026-11-05 (changes ADR-0003 in the part "pg-boss for jobs")

**Decision.** The `emails` table is at the same time the queue, the log and the counter for the monthly limit. Notifications are written in the same transaction as the change that caused them (rollback = no e-mail). The worker runs in the web process (`instrumentation.ts`), takes rows with `FOR UPDATE SKIP LOCKED`, and on error retries with exponential backoff (max 5×). Over the plan limit, rows are marked `deferred` and go out once a day as one digest per user.

**Why.** A single job type (e-mail) does not need a library; one table gives the limit, audit and retry for free. Safe even with several replicas.

**When to revisit.** When more job types are added (AI summaries, webhooks) — then pg-boss.
