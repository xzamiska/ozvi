# 0012 Voluntary anonymous statistics from self-hosted servers

**Status:** accepted 2026-11-12

**Context.** The owner wants to know how many people use Ozvi not only in the cloud but also on their own servers. Until now there was no way to learn anything about a self-host installation: the version check is a plain GET to `releases.json` and nothing is recorded during it. Ozvi is built on privacy (widget without cookies, boards are not indexed), so silent data collection is out of the question.

**Decision.**
- The statistics are **opt-in**: they are sent only with `OZVI_TELEMETRY=1`, nothing by default. They are never sent from the cloud or from a development build.
- Once a day (the first time 10 minutes after start) the server sends `POST https://ozvi.io/api/telemetry` with exactly seven fields: a one-way hash of `OZVI_SECRET_KEY` (instance ID), the version and five totals (projects, users, active in the last 30 days, entries, entries in the last 30 days). No names, e-mails, URLs, slugs or content.
- The cloud accepts only these fields (it discards everything else), rate-limits requests per IP and keeps one row per instance (`telemetry_instances`) with the latest counts. This is not customer data, so the table has no `project_id` and no RLS.
- The exact list of fields is in `docs/SELFHOST.md`; the private admin shows them in aggregate.

**Rejected.** Counting instances by IP address during the version check: inaccurate (shared IPs, NAT), and it would turn a plain GET into tracking without consent.

**Consequences.** The self-host numbers will be underestimated (only those who agree). That is the price for the promise "we send nothing without your consent" holding literally.
