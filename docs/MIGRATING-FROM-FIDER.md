# Migrating from Fider

Fider is imported through the same engine as CSV and Canny: a preview first (nothing is saved), then the import runs in the background with progress. No one gets an e-mail or a webhook, a repeated import brings over only what has been added in Fider since (the Fider ids are the key), and the whole run can be undone in Admin → Import.

## In the admin (recommended)

Admin → Import → **Fider**, two options:

- **Fider backup** — in Fider, Administration → Export → Backup (`backup.zip`, JSON per table). It contains everything, including e-mail addresses, sign-in identities (`user_providers`) and attachments stored in Fider's database. Up to 25 MB.
- **Fider API** — the Fider address + an administrator's API key (My settings → API key). The key stays only in the server's memory during the import and is never stored. In the cloud the address goes through SSRF protection (`lib/net.ts`, no internal addresses, no redirects). The Fider API does not return attachments directly on posts (only on comments), and returns sign-in identities only if your Fider version sends them; for a complete transfer, use the backup.

In the preview you choose the **tag that marks bugs** (`bug` by default) and the **sign-in from your app** (by default the only custom OAuth provider, whose name starts with `_`, e.g. `_billiwo`).

## From the command line

```sh
# The Fider database directly (as before), a backup, or the API (key in a variable, not in the command)
DATABASE_URL=postgres://ozvi:…@host/ozvi pnpm --filter @ozvi/web import:fider --project billiwo \
  --from postgres://fider:…@host/fider [--tenant feedback] --dry-run
pnpm --filter @ozvi/web import:fider --project billiwo --backup backup.zip
FIDER_API_KEY=… pnpm --filter @ozvi/web import:fider --project billiwo --api https://feedback.billiwo.com
# options: --provider _billiwo, --bug-tag bug | --no-bugs, --dry-run
```

The command records the run in the import history, so it can be undone from the admin.

## What gets transferred

| Fider | Ozvi |
|---|---|
| post with the bug tag | private bug report (no votes) |
| other posts | ideas; **the number stays** if it is free on the board (otherwise it gets a new one after the highest Fider number — the preview tells you) |
| open / planned / started / completed / declined | Suggested / Planned / In progress / Shipped / Declined (bugs: Received / Confirmed / In progress / Fixed / Won’t fix) |
| duplicate | merged into the original (hidden from the list) |
| unapproved post (moderation) | in the approval queue |
| deleted posts, comments, users | skipped (content of a deleted user stays without an author) |
| team response with a status change | a comment by the author of the response |
| tags | tags with the same visibility (public / team only), colour matched by hue |
| votes, comments | transferred, vote counts recalculated |
| attachments (`blobs` in Fider's DB) | copied into Ozvi storage (type check, 10 MB, plan quota); missing ones are reported |
| user with an identity from the app's provider | **external id = id in the app** → the first SSO sign-in lands on the same person |
| other users | by e-mail (an existing one on the board is reused, a new one gets `email:<address>`), without an e-mail `fider:<id>` |
| administrator / collaborator | admin / team (new people only; existing people keep their role) |
| unsubscribed from e-mails | `email_opt_out` |

## Old Fider links

Links to Fider posts (in old e-mails, bookmarks, issues) keep working. When the board runs on Fider's original domain (Admin → Custom domain, e.g. `feedback.billiwo.com` with a CNAME to Ozvi), the address `/posts/<number>/<slug>` permanently (301) redirects to the same post, even if it got a new number during the import. A merged duplicate leads to the original. A post that was not imported (or was deleted in Fider) leads to the board's home page, not to a 404 error. Without a custom domain, the same works on `ozvi.io/<project>/posts/<number>`.

The import remembers Fider numbers since version 1.2.15. For a board imported earlier, old links lead to the board's home page; if you want them exact, undo the import (Admin → Import) and run it again.

**Verified** by the tests `apps/web/src/lib/import-fider.test.ts` (backup from a zip, API through a fake Fider, identical ids from both paths, repeated import after a new post is added, undo including files) and in a browser against a local fake Fider API. Fixture `apps/web/src/lib/import/fixtures/fider-backup/`; the original `apps/web/scripts/fixtures/fider-sample.sql` is the real `getfider/fider:stable` schema for `--from`.

**Before migrating production:** Fider v0.37 fixed a cross-tenant login takeover — if the migration won't happen right away, update Fider.
