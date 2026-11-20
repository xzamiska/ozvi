import { pageMeta } from "@/lib/seo";
import type { Metadata } from "next";
import { Code, Note, Table } from "@/components/docs/blocks";
import { DocsShell, type TocEntry } from "@/components/docs/DocsShell";
import { publicUrl } from "@/lib/email/url";
import { MCP_TOOLS } from "@/lib/mcp-tools";
import { LIMITS } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ title: "MCP server – Ozvi", description: "Connect Claude, ChatGPT, Cursor or VS Code to an Ozvi board over MCP: OAuth or a personal token, scopes, the tools and how destructive actions are confirmed.", path: "/docs/mcp", locale: "en" });


export default function McpDocs() {
  const host = publicUrl();
  const url = `${host}/acme/mcp`;
  const toc: TocEntry[] = [
    { id: "connect", label: "Connect an assistant" },
    { id: "oauth", label: "OAuth (no token)", sub: true },
    { id: "token", label: "Personal token", sub: true },
    { id: "scopes", label: "Scopes" },
    { id: "tools", label: "Tools" },
    { id: "safety", label: "Safety" },
  ];
  return (
    <DocsShell page="mcp" title="MCP server" toc={toc} lede={<>
      Every board is a remote <a href="https://modelcontextprotocol.io/" className="oz-link">Model Context Protocol</a> server. Connect Claude, ChatGPT, Cursor or VS Code and ask
      about your feedback in plain words: what people want most, which bugs came in this week, which ideas are duplicates. The assistant acts as you and can never do more than you can.
    </>}>
      <h2 id="connect">Connect an assistant</h2>
      <p>The server is at <code>/&lt;board&gt;/mcp</code> on the board&apos;s address, including its own domain (Streamable HTTP). In these examples the board is <code>acme</code>:</p>
      <Code title="MCP server URL" code={url} />
      <p>The board&apos;s <strong>My API tokens</strong> page (<code>/acme/tokens</code>) shows the exact address and commands for your board.</p>

      <h3 id="oauth">OAuth (no token)</h3>
      <p>Apps with connectors (Claude.ai, ChatGPT and others) sign in through OAuth: add a custom connector with the URL above, sign in to the board when the app asks, and approve the access level. Nothing to copy, and you can revoke the connection on the tokens page. OAuth tokens work only for this board&apos;s MCP server, not for the <a href="/docs/api">REST API</a>.</p>

      <h3 id="token">Personal token</h3>
      <p>Clients that take a URL and headers (Claude Code, Cursor, VS Code…) use a personal access token. Create one on <strong>My API tokens</strong> with the smallest scope that works; you see it only once.</p>
      <Code title="Claude Code" code={`
claude mcp add --transport http ozvi ${url} \\
  --header "Authorization: Bearer ozvi_pat_…"`} />
      <Code title="Cursor, VS Code and other clients" code={`
URL:    ${url}
Header: Authorization: Bearer ozvi_pat_…`} />
      <p>A token belongs to one board and works for its MCP server and its REST API. Revoking it on the tokens page stops it at once.</p>

      <h2 id="scopes">Scopes</h2>
      <p>The assistant gets the smaller of the token&apos;s scope and your current role on the board: a member&apos;s token never gets team rights, and a demotion downgrades every token at once.</p>
      <Table label="Scopes" head={["Scope", "Allows", "Who"]} rows={[
        [<code key="r">read</code>, "Search and read ideas, your own bugs (all bugs for the team), comments, tags and the changelog.", "anyone"],
        [<code key="w">write</code>, "Also file ideas and bugs and comment, as you.", "anyone"],
        [<code key="t">triage</code>, "Also statuses, tags, merges, internal notes, customer insights, GitHub links and publishing updates.", "team members"],
      ]} />

      <h2 id="tools">Tools</h2>
      <Table label="MCP tools" head={["Tool", "Scope", "What it does"]} rows={MCP_TOOLS.map(([name, scope, what]) => [
        <code key="n">{name}</code>, <code key="s">{scope}</code>, what,
      ])} />
      <p>Try: “What are the top 5 ideas we haven&apos;t planned yet?”, “Summarise new bugs from the past week”, “Find duplicates of #42”.</p>

      <h2 id="safety">Safety</h2>
      <ul>
        <li><strong>Destructive tools ask first.</strong> <code>merge_items</code>, <code>publish_update</code> and <code>publish_draft</code> answer the first call with a preview and a short-lived confirmation code. The assistant has to show you the preview and call again with the code after you agree; the code is bound to the exact arguments and expires in about 10 minutes.</li>
        <li><strong>Customer text is data.</strong> Titles, bodies and comments are written by your users and reach the model fenced off as untrusted data, never as instructions, with <code>author.trust</code> on each (<code>anonymous</code>, <code>email_verified</code>, <code>sso_customer</code>, <code>team</code>, <code>system</code>).</li>
        <li><strong>Lockdown.</strong> Send <code>X-Ozvi-Lockdown: verified</code> (or <code>team</code>) and text from less trusted authors is withheld; an admin can turn it on for every connection (admin → Integrations). The stricter setting wins.</li>
        <li><strong>Bugs stay private.</strong> A member&apos;s assistant sees only that member&apos;s own bug reports, like on the board.</li>
      </ul>
      <Note title="Rate limits">Each token may make up to {LIMITS.mcp.max} MCP requests per {LIMITS.mcp.windowMs / 60_000} minutes.</Note>
    </DocsShell>
  );
}
