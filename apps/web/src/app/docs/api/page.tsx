import { pageMeta } from "@/lib/seo";
import type { Metadata } from "next";
import { Code, Note, Table } from "@/components/docs/blocks";
import { DocsShell, type TocEntry } from "@/components/docs/DocsShell";
import { Operation, Schemas, opAnchor } from "@/components/docs/Reference";
import { openApiSpec } from "@/lib/api/openapi";
import { PROBLEMS, type ProblemCode } from "@/lib/api/problem";
import { ROUTES } from "@/lib/api/routes";
import { publicUrl } from "@/lib/email/url";
import { LIMITS } from "@/lib/ratelimit";

// PUBLIC_URL is read at request time (one image for self-host and cloud).
export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ title: "REST API – Ozvi", description: "Ozvi REST API v1: ideas, bug reports, votes, changelog and customers over HTTP, with an OpenAPI 3.1 document.", path: "/docs/api", locale: "en" });

const TAGS = ["Items", "Comments", "Votes", "Board", "Changelog", "People", "Integrations", "Account"] as const;

export default function ApiDocs() {
  const host = publicUrl();
  const base = `${host}/acme/api/v1`;
  const spec = openApiSpec(base) as { paths: Record<string, Record<string, any>>; components: { schemas: Record<string, any> } };
  const perMin = Math.round(LIMITS.api.max / (LIMITS.api.windowMs / 60_000));

  const toc: TocEntry[] = [
    { id: "start", label: "Quick start" },
    { id: "auth", label: "Authentication and scopes" },
    { id: "untrusted", label: "User content and provenance" },
    { id: "pagination", label: "Pagination" },
    { id: "errors", label: "Errors" },
    { id: "rate-limits", label: "Rate limits" },
    { id: "idempotency", label: "Idempotency and ETags" },
    { id: "confirmation", label: "Destructive actions" },
    { id: "reference", label: "Endpoints" },
    ...TAGS.map((t) => ({ id: `tag-${t.toLowerCase()}`, label: t, sub: true })),
    { id: "schemas", label: "Schemas" },
  ];

  return (
    <DocsShell page="api" title="REST API" toc={toc} lede={<>
      Read and change one board over HTTP: ideas, bug reports, comments, votes, the changelog and your customers. The API follows the same rules as the board and
      the <a href="#auth" className="oz-link">MCP server</a>, from the same token. Machine-readable: <a href={`${host}/acme/api/v1/openapi.json`} className="oz-link">openapi.json</a> (OpenAPI 3.1, every board serves its own).
    </>}>
      <h2 id="start">Quick start</h2>
      <p>Every board has its API at <code>/&lt;board&gt;/api/v1</code> on the board&apos;s address, including its own domain. In these examples the board is <code>acme</code>:</p>
      <Code title="Base URL" code={base} />
      <ol>
        <li>Open the board, then <strong>My API tokens</strong> (<code>/acme/tokens</code>), and create a token. Pick the smallest scope that works.</li>
        <li>Send it in the <code>Authorization</code> header.</li>
      </ol>
      <Code title="curl" code={`
curl ${base}/items?kind=idea&sort=top&limit=5 \\
  -H "Authorization: Bearer $OZVI_TOKEN"

# File an idea (retry-safe with Idempotency-Key)
curl -X POST ${base}/items \\
  -H "Authorization: Bearer $OZVI_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"kind":"idea","title":"Export to Excel","body":"Our accountant needs XLSX."}'`} />
      <Code title="fetch (Node 18+, Deno, Bun)" code={`
const res = await fetch("${base}/items?sort=top&limit=10", {
  headers: { Authorization: \`Bearer \${process.env.OZVI_TOKEN}\` },
});
if (!res.ok) throw new Error((await res.json()).detail); // problem+json
const { data, nextCursor } = await res.json();`} />

      <h2 id="auth">Authentication and scopes</h2>
      <p>The API takes <strong>personal access tokens</strong> (<code>ozvi_pat_&lt;board&gt;_…</code>) of the same board. A token acts as the person who created it, with the smaller of the token&apos;s scope and that person&apos;s current role: a member&apos;s token never gets team rights, and demoting someone downgrades their tokens at once. <code>GET /me</code> tells you what a token can do.</p>
      <Table label="Scopes" head={["Scope", "Allows", "Who"]} rows={[
        [<code key="r">read</code>, "Read ideas, your own bugs (everything for the team), comments, tags, statuses, the published changelog.", "anyone"],
        [<code key="w">write</code>, "Also file ideas and bugs and comment, as the token's owner.", "anyone"],
        [<code key="t">triage</code>, "Also status, sub-status, tags, merges, internal notes, voters and votes on behalf of customers, people with their traits, changelog drafts and publishing, exports. Webhooks list: admins only.", "team members"],
      ]} />
      <p><strong>OAuth tokens</strong> issued to AI assistants are bound to the MCP resource (<code>/&lt;board&gt;/mcp</code>, RFC 8707) and are refused here with <code>token_audience</code>; an integration that calls the REST API should use a personal token of a dedicated account, so it can be revoked on its own. Tokens never work across boards. Requests from browsers are not supported (no CORS): keep the token on your server.</p>

      <h2 id="untrusted">User content and provenance</h2>
      <p>Titles, bodies and comments are written by your users and come back as plain JSON strings, as written (the board&apos;s small Markdown subset). Treat them as <strong>untrusted data</strong>: escape them before rendering HTML, and never paste them into an AI model&apos;s instructions without fencing them off as data.</p>
      <ul>
        <li><code>author.trust</code> on every item and comment says how much Ozvi knows about the writer: <code>anonymous</code> &lt; <code>email_verified</code> &lt; <code>sso_customer</code> &lt; <code>team</code>; <code>system</code> marks ideas filed from customer feedback by the team&apos;s agent.</li>
        <li><code>source</code> says where it came in: <code>board</code>, <code>widget</code>, <code>mcp</code>, <code>import</code> or <code>api</code>. Everything created through this API is <code>api</code>.</li>
        <li><strong>Lockdown</strong>: send <code>X-Ozvi-Lockdown: verified</code> (or <code>team</code>) and text from less trusted authors is withheld: the item keeps its number, status and votes, its title becomes a placeholder, <code>body</code> is empty and <code>withheld: true</code> is set. A project can turn lockdown on for every token (admin → Integrations); the stricter setting wins.</li>
        <li><strong>AI label</strong> (EU AI Act art. 50): changelog entries and duplicate suggestions carry <code>ai</code>: <code>null</code> when people wrote it, otherwise <code>{"{ generated: true, model, reviewedBy }"}</code>. <code>reviewedBy</code> stays null until a person approves the text. Show the label wherever you republish such text.</li>
      </ul>

      <h2 id="pagination">Pagination</h2>
      <p>Lists answer <code>{"{ data: [...], nextCursor }"}</code>. Pass <code>nextCursor</code> back as <code>cursor</code> with the same filters and sort until it is <code>null</code>. Cursors are opaque; a cursor from another sort answers <code>invalid_cursor</code>. <code>limit</code> is 1–100 (items, people) or 1–50 (changelog).</p>
      <Code title="Every idea, page by page (Node)" code={`
let cursor = null;
do {
  const url = new URL("${base}/items");
  url.search = new URLSearchParams({ kind: "idea", limit: "100", ...(cursor && { cursor }) });
  const page = await (await fetch(url, { headers: { Authorization: \`Bearer \${token}\` } })).json();
  for (const item of page.data) console.log(item.number, item.votes, item.title);
  cursor = page.nextCursor;
} while (cursor);`} />

      <h2 id="errors">Errors</h2>
      <p>Errors are <a href="https://www.rfc-editor.org/rfc/rfc9457">RFC 9457</a> problem details (<code>application/problem+json</code>). Branch on <code>code</code>, which never changes; <code>detail</code> is for people. Invalid requests list the fields in <code>errors</code>.</p>
      <p>Everything the API says is in English. To get the human-readable fields (stage labels, <code>detail</code>) in one of the board&apos;s languages, send <code>Accept-Language</code>; the response&apos;s <code>Content-Language</code> says which one you got.</p>
      <Code title="401" code={`
{
  "type": "${host}/docs/api#error-unauthorized",
  "title": "Missing or invalid token",
  "status": 401,
  "code": "unauthorized",
  "detail": "Send a personal access token as Authorization: Bearer ozvi_pat_…",
  "instance": "/acme/api/v1/items"
}`} />
      <Table label="Error codes" head={["code", "Status", "Meaning"]} rows={(Object.keys(PROBLEMS) as ProblemCode[]).map((c) => [
        <code key="c" id={`error-${c.replace(/_/g, "-")}`} className="scroll-mt-24">{c}</code>, PROBLEMS[c].status, PROBLEMS[c].title,
      ])} />

      <h2 id="rate-limits">Rate limits</h2>
      <p>Each token may make {LIMITS.api.max} requests per {LIMITS.api.windowMs / 60_000} minutes (about {perMin} a minute on average); creating posts, comments and votes has the same lower limits as on the board. Every answer carries the <a href="https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/">standard headers</a>; over the limit you get <code>429</code> with <code>Retry-After</code> in seconds.</p>
      <Code title="Headers" code={`
RateLimit-Limit: ${LIMITS.api.max}
RateLimit-Remaining: 594
RateLimit-Reset: 412`} />

      <h2 id="idempotency">Idempotency and ETags</h2>
      <p>Requests that create something (<code>POST /items</code>, comments, votes, changelog drafts) accept an <code>Idempotency-Key</code> header (up to 255 characters, a UUID is ideal). For 24 hours a retry with the same key and the same body gets the first answer again, marked <code>Idempotent-Replayed: true</code>; the same key with a different body answers <code>idempotency_key_reused</code>, and a retry while the first request still runs answers <code>idempotency_in_progress</code>. Server errors are not remembered, so they can be retried with the same key.</p>
      <p><code>GET</code> answers carry an <code>ETag</code>. Send it back as <code>If-None-Match</code> and an unchanged item answers <code>304 Not Modified</code> with no body: cheap polling.</p>

      <h2 id="confirmation">Destructive actions</h2>
      <p>Two calls cannot be undone, so they need an explicit confirmation, like in MCP:</p>
      <ul>
        <li><strong>Merge</strong> (<code>POST /items/&#123;number&#125;/merge</code>): the first call answers <code>409 confirmation_required</code> with a <code>preview</code> and a <code>confirm</code> code. Show the preview to a person, then repeat the call with <code>&quot;confirm&quot;: &quot;&lt;code&gt;&quot;</code> within about 10 minutes.</li>
        <li><strong>Publish a changelog entry</strong> (<code>POST /changelog/&#123;id&#125;/publish</code>): requires <code>{'{"confirm": true}'}</code>; without it you get the preview with the number of people who will be e-mailed. The token&apos;s owner is recorded as the reviewer of AI-assisted text.</li>
      </ul>
      <Note title="Voting never subscribes">Votes cast through the API follow the board: voters are not e-mailed on status changes, only once when a changelog entry ships their idea.</Note>

      <h2 id="reference">Endpoints</h2>
      <p>Relative to <code>{base}</code>. {ROUTES.length} operations; the same list is in <code>openapi.json</code> for code generators, Postman or Insomnia.</p>
      <nav aria-label="Endpoints" className="my-5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {ROUTES.map((r) => (
          <a key={r.id} href={`#${opAnchor(r.id)}`} className="flex min-h-7 items-center gap-2 text-[13.5px] !no-underline hover:!underline">
            <span className="w-14 shrink-0 font-mono text-[11.5px] font-semibold text-muted-foreground">{r.method}</span>
            <span className="min-w-0 truncate font-mono text-[13px] text-foreground">{r.path}</span>
          </a>
        ))}
      </nav>
      {TAGS.map((tag) => (
        <div key={tag} className="min-w-0">
          <h3 id={`tag-${tag.toLowerCase()}`}>{tag}</h3>
          {ROUTES.filter((r) => r.tag === tag).map((r) => (
            <Operation key={r.id} path={r.path} method={r.method} op={spec.paths[r.path]![r.method.toLowerCase()]} />
          ))}
        </div>
      ))}

      <h2 id="schemas">Schemas</h2>
      <Schemas schemas={spec.components.schemas} />
    </DocsShell>
  );
}
