import { pageMeta } from "@/lib/seo";
import type { Metadata } from "next";
import { Code, Note, Table } from "@/components/docs/blocks";
import { DocsShell, type TocEntry } from "@/components/docs/DocsShell";
import { publicUrl } from "@/lib/email/url";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({
  title: "Widget – Ozvi",
  description: "Add the Ozvi widget to your app: sign-in with a signed token, what a bug report captures, screenshot privacy (form values, e-mails and phone numbers covered by default) and configuration.",
  path: "/docs/widget",
  locale: "en",
});

const REPO = "https://github.com/xzamiska/ozvi/blob/main/packages/widget/README.md";

export default function WidgetDocs() {
  const host = publicUrl();
  const toc: TocEntry[] = [
    { id: "install", label: "Add it to your app" },
    { id: "sign-in", label: "Sign people in" },
    { id: "captures", label: "What a bug report captures" },
    { id: "privacy", label: "Screenshot privacy" },
    { id: "mark", label: "data-ozvi-mask", sub: true },
    { id: "all", label: "Cover everything", sub: true },
    { id: "config", label: "Configuration" },
    { id: "more", label: "More" },
  ];
  return (
    <DocsShell page="widget" title="Widget" toc={toc} lede={<>
      The widget lets people report a bug or suggest an idea without leaving your app. Bug reports arrive with a screenshot and
      technical details; private data is masked in the browser before anything is sent.
    </>}>
      <h2 id="install">Add it to your app</h2>
      <p>Two lines anywhere in your page. <code>project</code> is your board&apos;s address (<code>{host}/<b>acme</b></code>), <code>token-url</code> an endpoint of your app that says who is signed in.</p>
      <Code title="HTML" code={`
<script src="${host}/widget.js" defer></script>
<ozvi-widget project="acme" token-url="/api/ozvi-token" app-version="2.15.0"></ozvi-widget>`} />
      <p>Allow your app&apos;s address in the board&apos;s settings (<strong>admin → Project → Your app&apos;s addresses</strong>); elsewhere the widget won&apos;t work. React and Vue components, the JavaScript API (<code>Ozvi.open(&quot;bug&quot;)</code>, events) and the inline roadmap and changelog are described in the <a href={REPO}>widget README</a>.</p>

      <h2 id="sign-in">Sign people in</h2>
      <p>Your backend tells Ozvi who is signed in: an endpoint of your app (the widget&apos;s <code>token-url</code>) returns <code>{"{ \"token\": \"…\" }"}</code>, a short-lived token signed with the board&apos;s SSO secret (admin → Sign-in → Turn on SSO). No second password and no Ozvi account for your users. Keep the secret on the server, never in the browser.</p>
      <p>In Node.js, <code>@ozvi/sdk</code> (MIT, no dependencies) signs it. The token is a standard JWT signed with HMAC-SHA256, so any other language makes it with its standard library. Fields: <code>id</code> (required, stable id in your app), <code>email</code>, <code>name</code>, <code>role</code> (<code>member</code>, <code>team</code> or <code>admin</code>), <code>locale</code> and <code>traits</code> (<code>company</code>, <code>plan</code>, <code>mrr</code> in cents… shown to your team only).</p>
      <Code title="Node.js: npm i @ozvi/sdk" code={`
import { signOzviToken } from "@ozvi/sdk";

// Express; in Next.js the same inside app/api/ozvi-token/route.ts
app.get("/api/ozvi-token", requireLogin, (req, res) => {
  res.json({ token: signOzviToken(
    { id: req.user.id, email: req.user.email, name: req.user.name,
      traits: { company: req.org.name, plan: req.org.plan } },
    process.env.OZVI_SSO_SECRET) });
});`} />
      <Code title="Python" code={`
import base64, hashlib, hmac, json, os, time

def ozvi_token(user: dict, secret: str = os.environ["OZVI_SSO_SECRET"]) -> str:
    b64 = lambda o: base64.urlsafe_b64encode(json.dumps(o, separators=(",", ":")).encode()).rstrip(b"=").decode()
    now = int(time.time())
    body = f'{b64({"alg": "HS256", "typ": "JWT"})}.{b64({**user, "iat": now, "exp": now + 600})}'
    sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"`} />
      <Code title="PHP" code={`
function ozvi_token(array $user, ?string $secret = null): string {
    $secret ??= getenv('OZVI_SSO_SECRET');
    $b64 = fn($s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    $now = time();
    $body = $b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT'])) . '.'
          . $b64(json_encode($user + ['iat' => $now, 'exp' => $now + 600], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $body . '.' . $b64(hash_hmac('sha256', $body, $secret, true));
}`} />
      <Note title="Keep it short-lived">Ozvi accepts a token only with the right secret and before <code>exp</code>. Ten minutes is plenty: the widget asks your endpoint for a fresh one whenever it needs it. Tokens carry your users&apos; e-mails, so don&apos;t paste them into online decoders.</Note>

      <h2 id="captures">What a bug report captures</h2>
      <p>Everything is kept in memory only, masked in the browser before it is kept, and leaves the page only when the person sends a report. The network log, steps and session links are visible to your team only; the Ozvi server masks and bounds them again.</p>
      <Table label="What a bug report captures" head={["What", "Detail", "Never"]} rows={[
        ["Page", "Address (masked), app version, browser, window size, language", ""],
        ["Screenshot", "The visible part of the page without the widget, with private data covered (below). The reporter sees it first, can mark it up or remove it.", "Form values, e-mails, phone numbers, IBANs, card numbers, tokens, data-ozvi-mask"],
        ["Console errors", "Last 20, 300 characters each", ""],
        ["Network log", "Last 30 requests: method, URL, status, duration, size", "Headers (no Authorization, no Cookie); bodies unless you turn them on"],
        ["Steps", "Last 30 page changes and clicks on buttons and links, by name", "What anyone typed"],
      ]} />
      <p>In URLs and logged text, values of parameters named like <code>token</code>, <code>password</code>, <code>key</code>, <code>session</code> or <code>card</code>, and any JWT, <code>Bearer</code> credential, e-mail address, IBAN or card number become <code>***</code>.</p>

      <h2 id="privacy">Screenshot privacy</h2>
      <p>The screenshot is drawn from a <strong>copy</strong> of the page that the widget edits first. The page the person sees is never touched, and what is covered never becomes pixels: covered text is drawn transparent on a solid box, covered images are not drawn at all. Without any setup, Ozvi covers:</p>
      <ul>
        <li>the values of every <code>input</code>, <code>textarea</code>, <code>select</code> and editable area (checkboxes and radio buttons keep their state);</li>
        <li>e-mail addresses, phone numbers, IBANs, card numbers and tokens anywhere in the text; the rest of the sentence stays readable;</li>
        <li>everything inside elements marked <code>data-ozvi-mask</code>.</li>
      </ul>
      <p>If the copy can&apos;t be masked, the report is sent <strong>without</strong> a screenshot, never with an unmasked one.</p>

      <h3 id="mark">Mark what can&apos;t be recognised: data-ozvi-mask</h3>
      <p>Names, notes, diagnoses or amounts don&apos;t have a recognisable shape. Mark them and the whole element is covered, its images too:</p>
      <Code title="HTML" code={`
<td data-ozvi-mask>Jana Kováčová</td>
<p data-ozvi-mask>{{ client.note }}</p>`} />

      <h3 id="all">Cover everything</h3>
      <p>For apps where almost everything on screen is private (health care, finance, HR), cover all text and images and reveal only what helps your team understand the page, such as navigation and headings:</p>
      <Code title="JavaScript and HTML" code={`
<script>window.OzviConfig = { mask: "all" };</script>
<nav data-ozvi-unmask>…</nav>
<h1 data-ozvi-unmask>Invoice settings</h1>`} />
      <Note title="Your privacy policy">The board&apos;s settings (admin → Project data → Text for your privacy policy) generate paragraphs describing exactly what your widget sends, for your own privacy policy.</Note>

      <h2 id="config">Configuration</h2>
      <p>Set <code>window.OzviConfig</code> before <code>widget.js</code> loads, or call <code>Ozvi.configure()</code> later.</p>
      <Code title="window.OzviConfig" code={`
window.OzviConfig = {
  mask: "auto",          // "all" = cover all text and images except [data-ozvi-unmask]
  network: true,         // false = no network log
  networkBodies: false,  // true = masked bodies of failed requests (max 2 000 characters)
  actions: true,         // false = no steps
  maskRequest(entry) {   // last word on every logged request; return null to drop it
    return { ...entry, url: entry.url.replace(/\\/customers\\/\\d+/, "/customers/:id") };
  },
};`} />

      <h2 id="more">More</h2>
      <p>The full reference (JavaScript API, events, React and Vue, inline roadmap and changelog, strict CSP with a nonce, the screenshot editor) is in the <a href={REPO}>widget README</a>. Try the widget in a sample app on the <a href="/en/demo">demo</a>.</p>
    </DocsShell>
  );
}
