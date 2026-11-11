import type { Metadata } from "next";
import { Code, Note } from "@/components/docs/blocks";
import { DocsShell, type TocEntry } from "@/components/docs/DocsShell";
import { publicUrl } from "@/lib/email/url";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Automation – Ozvi",
  description: "Connect Ozvi to n8n, Make and Zapier with webhooks and HTTP requests: copy-paste recipes.",
};

export default function AutomationDocs() {
  const host = publicUrl();
  const base = `${host}/acme/api/v1`;
  const toc: TocEntry[] = [
    { id: "pattern", label: "Two building blocks" },
    { id: "n8n", label: "n8n" },
    { id: "n8n-trigger", label: "Trigger on an Ozvi event", sub: true },
    { id: "n8n-crm", label: "Vote from your CRM", sub: true },
    { id: "make", label: "Make" },
    { id: "zapier", label: "Zapier" },
    { id: "recipes", label: "More recipes" },
  ];

  const n8nWorkflow = JSON.stringify({
    name: "Ozvi: deal won → customer's vote",
    nodes: [
      { parameters: { httpMethod: "POST", path: "deal-won", options: {} }, name: "CRM webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0] },
      {
        parameters: {
          method: "POST",
          url: `=${base}/items/{{ $json.body.ozviIdea }}/votes`,
          authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
          sendHeaders: true,
          headerParameters: { parameters: [{ name: "Idempotency-Key", value: "=deal-{{ $json.body.dealId }}" }] },
          sendBody: true, specifyBody: "json",
          jsonBody: "={{ JSON.stringify({ email: $json.body.contactEmail, company: $json.body.company }) }}",
          options: {},
        },
        name: "Ozvi: vote", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [260, 0],
      },
    ],
    connections: { "CRM webhook": { main: [[{ node: "Ozvi: vote", type: "main", index: 0 }]] } },
  }, null, 2);

  return (
    <DocsShell page="automation" title="Automation" toc={toc} lede={<>
      Ozvi has no app to install in n8n, Make or Zapier, and it needs none: every tool has a generic webhook trigger and a generic HTTP request,
      and those are all it takes. Recipes below; the field-by-field API is in the <a href="/docs/api" className="oz-link">API reference</a>.
    </>}>
      <h2 id="pattern">Two building blocks</h2>
      <ul>
        <li><strong>Ozvi → your tool</strong>: add the tool&apos;s webhook URL in Ozvi (admin → Integrations → Webhooks, format JSON). Every event arrives as one JSON body: <code>event</code>, <code>item</code>, <code>actor</code>… (<a href="/docs/webhooks#payload">payload</a>).</li>
        <li><strong>Your tool → Ozvi</strong>: an HTTP request to <code>{base}</code> with the header <code>Authorization: Bearer ozvi_pat_…</code>. Create the token on a dedicated team account with the smallest scope that works, and keep it in the tool&apos;s credentials, not in a plain field.</li>
      </ul>
      <Note title="Text from your users" tone="warn">Titles, bodies and comments are your users&apos; words. When a flow hands them to an AI step, pass them as data (a separate input), never as part of the instructions, and look at <code>item.author.trust</code>.</Note>

      <h2 id="n8n">n8n</h2>
      <h3 id="n8n-trigger">Trigger on an Ozvi event</h3>
      <ol>
        <li>Add a <strong>Webhook</strong> node, HTTP method <code>POST</code>, and copy its <em>Production URL</em>.</li>
        <li>In Ozvi, add a webhook with that URL, format JSON, and pick the events (for example <code>item.created</code>).</li>
        <li>Branch with an <strong>If</strong> or <strong>Switch</strong> node on <code>{"{{ $json.body.event }}"}</code>, e.g. bugs: <code>{"{{ $json.body.item.kind }}"}</code> equals <code>bug</code>.</li>
        <li>To verify the signature, turn on <em>Raw body</em> in the Webhook node options and use a <strong>Code</strong> node with the <a href="/docs/webhooks#node">Node.js check</a>.</li>
      </ol>
      <h3 id="n8n-crm">Vote from your CRM</h3>
      <p>When a deal is won, record the customer&apos;s vote on the idea it depended on. Create a <strong>Header Auth</strong> credential with name <code>Authorization</code> and value <code>Bearer ozvi_pat_…</code> (a team member&apos;s token with the triage scope), then paste this workflow into the n8n canvas (Ctrl/Cmd+V):</p>
      <Code title="n8n workflow (paste into the canvas)" code={n8nWorkflow} />
      <p>The <code>Idempotency-Key</code> makes a retried run harmless; an existing vote is kept as it is, and the answer says why a vote was not added (<code>reason</code>).</p>

      <h2 id="make">Make</h2>
      <p><strong>Ozvi → Make</strong>: start a scenario with <strong>Webhooks → Custom webhook</strong>, copy its address into Ozvi (format JSON) and use <em>Redetermine data structure</em> + the test button in Ozvi so Make learns the fields.</p>
      <p><strong>Make → Ozvi</strong>: the <strong>HTTP → Make a request</strong> module, for example to file a bug from a support ticket:</p>
      <Code title="HTTP → Make a request" code={`
URL:            ${base}/items
Method:         POST
Headers:        Authorization = Bearer ozvi_pat_…
                Idempotency-Key = ticket-{{1.id}}
Body type:      Raw
Content type:   JSON (application/json)
Request content:
{
  "kind": "bug",
  "title": "{{1.subject}}",
  "body": "Reported in ticket {{1.url}}\\n\\n{{1.description}}"
}
Parse response: Yes`} />
      <p>Make stops on a non-2xx answer; Ozvi&apos;s error body has <code>code</code> and <code>detail</code> (<a href="/docs/api#errors">errors</a>). Add an error handler route with <em>Resume</em> or <em>Break</em> for <code>rate_limited</code> (wait <code>Retry-After</code> seconds).</p>

      <h2 id="zapier">Zapier</h2>
      <p><strong>Ozvi → Zapier</strong>: trigger <strong>Webhooks by Zapier → Catch Hook</strong>, put its URL into Ozvi, send a test from Ozvi, and use <code>event</code>, <code>item__title</code>, <code>item__url</code>… in later steps. Add a <strong>Filter</strong> step on <code>event</code> when the hook receives several events.</p>
      <p><strong>Zapier → Ozvi</strong>: action <strong>Webhooks by Zapier → Custom Request</strong> (it sends a raw JSON body):</p>
      <Code title="Custom Request: post a comment" code={`
Method:   POST
URL:      ${base}/items/{{item_number}}/comments
Data:     {"body": "Customer replied in Help Scout: {{preview}}", "internal": true}
Headers:  Authorization | Bearer ozvi_pat_…
          Content-Type  | application/json`} />
      <p>Reading lists works the same with <code>GET</code>, e.g. <code>{base}/items?kind=idea&amp;sort=top&amp;limit=10</code> for a weekly digest.</p>

      <h2 id="recipes">More recipes</h2>
      <ul>
        <li><strong>New bug → Slack thread with the team</strong>: Ozvi has Slack, Teams and Discord formats built in (no automation needed); use a tool when you need routing rules.</li>
        <li><strong>Shipped → tell the customer success team</strong>: trigger on <code>changelog.published</code>, loop over <code>entry.ideas</code>, and for each call <code>GET /items/&#123;number&#125;/votes</code> to see which accounts asked for it.</li>
        <li><strong>Sync tags from your CRM</strong>: <code>PATCH /items/&#123;number&#125;</code> with <code>{'{"tags": {"add": ["enterprise"]}}'}</code> (existing tags only; see <code>GET /tags</code>).</li>
        <li><strong>Nightly export to a spreadsheet</strong>: <code>GET /export?what=ideas&amp;format=json</code> gives <code>{"{columns, rows}"}</code>, ready for Google Sheets “append rows”.</li>
      </ul>
    </DocsShell>
  );
}
