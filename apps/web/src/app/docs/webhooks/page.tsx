import { pageMeta } from "@/lib/seo";
import type { Metadata } from "next";
import { Code, Note, Table } from "@/components/docs/blocks";
import { DocsShell, type TocEntry } from "@/components/docs/DocsShell";
import { publicUrl } from "@/lib/email/url";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ title: "Webhooks – Ozvi", description: "Ozvi webhooks: events, payloads, Standard Webhooks signatures and how to verify them in Node, Python and PHP.", path: "/docs/webhooks", locale: "en" });

const EVENTS: [string, string][] = [
  ["item.created", "A new idea, or a new bug report (bugs only for hooks with “include bugs”). Posts waiting for moderation are sent once approved."],
  ["item.status_changed", "The stage changed. previousStatus, and proof (PRs, release, preview) when an item reaches fixed or shipped."],
  ["comment.created", "A public comment (internal notes and comments waiting for approval are never sent)."],
  ["item.merged", "A duplicate was merged; mergedInto has the original's number and title."],
  ["item.linked", "Linked to a GitHub issue; link has ref and url."],
  ["item.tags_changed", "Public tags changed; tagsChange has previous, added, removed (team-only tags never leave Ozvi)."],
  ["changelog.published", "An update was published; entry has title, body, url, version, the shipped ideas and the AI label."],
];

export default function WebhookDocs() {
  const host = publicUrl();
  const toc: TocEntry[] = [
    { id: "setup", label: "Set up" },
    { id: "events", label: "Events" },
    { id: "payload", label: "Payload" },
    { id: "headers", label: "Headers" },
    { id: "verify", label: "Verify signatures" },
    { id: "node", label: "Node.js", sub: true },
    { id: "python", label: "Python", sub: true },
    { id: "php", label: "PHP", sub: true },
    { id: "delivery", label: "Retries and ordering" },
    { id: "legacy", label: "Ozvi-Signature" },
  ];
  return (
    <DocsShell page="webhooks" title="Webhooks" toc={toc} lede={<>
      Ozvi tells your systems when something happens on a board: a new bug, a status change, a published update. JSON deliveries are signed following
      {" "}<a href="https://www.standardwebhooks.com/" className="oz-link">Standard Webhooks</a>, so any of its libraries can verify them.
    </>}>
      <h2 id="setup">Set up</h2>
      <p>An admin adds a webhook in the board&apos;s settings, <strong>admin → Integrations → Webhooks</strong>: the URL (HTTPS), the events (none = all) and whether bug reports are included (bugs are private; send them only to systems your team controls). Ozvi shows the signing <strong>secret once</strong>; store it in your receiver&apos;s configuration. The test button sends a sample <code>item.created</code> with <code>&quot;test&quot;: true</code>.</p>
      <p>Chat formats (Slack, Microsoft Teams, Discord) post a readable message instead of JSON and are not signed; everything below is about the JSON format. In Discord, messages come from the board: its name and logo (Ozvi&apos;s mark when the board has none), mentions switched off.</p>

      <h2 id="events">Events</h2>
      <Table label="Events" head={["Event", "When"]} rows={EVENTS.map(([e, t]) => [<code key="e">{e}</code>, t])} />

      <h2 id="payload">Payload</h2>
      <p>One JSON object per delivery. Text fields come from your users: treat them as untrusted (see <a href="/docs/api#untrusted">user content and provenance</a>). <code>bodyText</code> is the same text without Markdown, handy for chat or e-mail.</p>
      <Code title="item.status_changed" code={`
{
  "event": "item.status_changed",
  "project": { "slug": "acme", "name": "Acme", "logoUrl": "https://acme.example/logo.png" },
  "item": {
    "number": 128,
    "kind": "bug",
    "title": "Invoice PDF has the wrong VAT rate",
    "body": "After the update the PDF shows **20 %**…",
    "bodyText": "After the update the PDF shows 20 %…",
    "status": "fixed",
    "fixedInVersion": "2.14.1",
    "votes": 0,
    "url": "${host}/acme/i/128",
    "createdAt": "2026-11-02T09:14:03.120Z",
    "tags": ["invoices"],
    "author": { "name": "Jana", "trust": "sso_customer" },
    "source": "widget"
  },
  "actor": { "name": "Peter" },
  "previousStatus": "in_progress",
  "proof": { "prs": [{ "url": "https://github.com/acme/app/pull/45", "title": "Fix VAT", "ref": "acme/app#45" }], "release": { "tag": "v2.14.1", "url": null }, "preview": null },
  "at": "2026-11-08T10:01:22.481Z"
}`} />

      <h2 id="headers">Headers</h2>
      <Table label="Delivery headers" head={["Header", "Value"]} rows={[
        [<code key="1">webhook-id</code>, <>Unique per delivery, the same on every retry (<code>msg_…</code>). Use it to ignore duplicates.</>],
        [<code key="2">webhook-timestamp</code>, "Unix seconds when the delivery was signed."],
        [<code key="3">webhook-signature</code>, <><code>v1,&lt;base64&gt;</code>: HMAC-SHA256 of <code>id.timestamp.body</code>. May hold several space-separated signatures.</>],
        [<code key="4">ozvi-event</code>, "The event name, as in the body."],
        [<code key="5">ozvi-delivery</code>, "The delivery id without the msg_ prefix."],
        [<code key="6">ozvi-signature</code>, <>The original signature, kept for receivers built before Standard Webhooks (<a href="#legacy">see below</a>).</>],
      ]} />

      <h2 id="verify">Verify signatures</h2>
      <p>Always verify on the <strong>raw body</strong>, before parsing JSON, compare in constant time, and reject timestamps older than five minutes (replays).</p>
      <p>The secret Ozvi shows you is the base64url form of 32 random bytes. Standard Webhooks libraries expect the same bytes as <code>whsec_</code> + standard base64; convert once:</p>
      <Code title="Your secret → whsec_ form" code={`
node -e 'console.log("whsec_" + Buffer.from(process.argv[1], "base64url").toString("base64"))' "<secret from Ozvi>"`} />
      <Code title="With the official library (npm i standardwebhooks)" code={`
import { Webhook } from "standardwebhooks";

const wh = new Webhook(process.env.OZVI_WHSEC); // the whsec_… form
const event = wh.verify(rawBody, req.headers);  // throws on a bad signature or an old timestamp`} />
      <p>Or without a library, in a few lines:</p>

      <h3 id="node">Node.js</h3>
      <Code title="verify.mjs (Express)" code={`
import crypto from "node:crypto";
import express from "express";

const key = Buffer.from(process.env.OZVI_WEBHOOK_SECRET, "base64url"); // the secret as shown in Ozvi

function verify(raw, h) {
  const id = h["webhook-id"], ts = h["webhook-timestamp"], sigs = h["webhook-signature"] ?? "";
  if (!id || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = crypto.createHmac("sha256", key).update(\`\${id}.\${ts}.\${raw}\`).digest();
  return sigs.split(" ").some((part) => {
    const [v, sig] = part.split(",");
    const got = Buffer.from(sig ?? "", "base64");
    return v === "v1" && got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

const app = express();
app.post("/ozvi", express.raw({ type: "application/json" }), (req, res) => {
  if (!verify(req.body.toString("utf8"), req.headers)) return res.sendStatus(401);
  const event = JSON.parse(req.body);
  // … handle event.event, dedupe by req.headers["webhook-id"]
  res.sendStatus(204);
});
app.listen(3000);`} />

      <h3 id="python">Python</h3>
      <Code title="verify.py (Flask)" code={`
import base64, hashlib, hmac, os, time
from flask import Flask, abort, request

KEY = base64.urlsafe_b64decode(os.environ["OZVI_WEBHOOK_SECRET"] + "==")  # the secret as shown in Ozvi

def verify(raw: bytes, h) -> bool:
    msg_id, ts, sigs = h.get("webhook-id"), h.get("webhook-timestamp"), h.get("webhook-signature", "")
    if not msg_id or not ts or abs(time.time() - int(ts)) > 300:
        return False
    expected = hmac.new(KEY, f"{msg_id}.{ts}.".encode() + raw, hashlib.sha256).digest()
    for part in sigs.split(" "):
        version, _, sig = part.partition(",")
        if version == "v1" and hmac.compare_digest(base64.b64decode(sig), expected):
            return True
    return False

app = Flask(__name__)

@app.post("/ozvi")
def ozvi():
    if not verify(request.get_data(), request.headers):
        abort(401)
    event = request.get_json()
    # … handle event["event"]
    return "", 204`} />

      <h3 id="php">PHP</h3>
      <Code title="ozvi.php" code={`
<?php
$key = base64_decode(strtr(getenv('OZVI_WEBHOOK_SECRET'), '-_', '+/')); // the secret as shown in Ozvi
$raw = file_get_contents('php://input');
$id = $_SERVER['HTTP_WEBHOOK_ID'] ?? '';
$ts = $_SERVER['HTTP_WEBHOOK_TIMESTAMP'] ?? '';
$sigs = $_SERVER['HTTP_WEBHOOK_SIGNATURE'] ?? '';

$ok = false;
if ($id !== '' && ctype_digit($ts) && abs(time() - (int) $ts) <= 300) {
    $expected = hash_hmac('sha256', "$id.$ts.$raw", $key, true);
    foreach (explode(' ', $sigs) as $part) {
        [$version, $sig] = array_pad(explode(',', $part, 2), 2, '');
        if ($version === 'v1' && hash_equals($expected, base64_decode($sig))) { $ok = true; break; }
    }
}
if (!$ok) { http_response_code(401); exit; }

$event = json_decode($raw, true);
// … handle $event['event']
http_response_code(204);`} />

      <h2 id="delivery">Retries and ordering</h2>
      <ul>
        <li>Answer with any <code>2xx</code> within 10 seconds. Do the slow work afterwards (a queue), not before answering.</li>
        <li>Anything else is retried: Ozvi tries six times in all, after 1, 4, 9, 16 and 25 minutes. Redirects are not followed.</li>
        <li>The order of deliveries is not guaranteed; use <code>at</code> and the item&apos;s current state (<code>GET /items/&#123;number&#125;</code>) when order matters.</li>
        <li>The same delivery can arrive twice (a retry after a timeout): dedupe by <code>webhook-id</code>.</li>
        <li>Delivery history (30 days) and failures are in admin → Integrations.</li>
      </ul>

      <h2 id="legacy">Ozvi-Signature</h2>
      <p>Receivers built before Standard Webhooks can keep using <code>Ozvi-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>: the hex HMAC-SHA256 of <code>&lt;t&gt;.&lt;body&gt;</code>, keyed with the secret string exactly as shown in Ozvi (not decoded). Both headers are sent on every JSON delivery.</p>
      <Note title="Moving to Standard Webhooks">Nothing to change in Ozvi: switch your receiver to the <code>webhook-*</code> headers whenever it suits you.</Note>
    </DocsShell>
  );
}
