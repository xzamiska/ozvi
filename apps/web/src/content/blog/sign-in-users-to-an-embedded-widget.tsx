import { Code, Note, Table } from "@/components/docs/blocks";

export default function Post() {
  return (
    <>
      <p>
        A feedback widget is only useful if it knows who is talking. &ldquo;Someone&rdquo; reported a bug on the invoice
        page is a dead end; &ldquo;Sarah from Pilates House, on the Pro plan&rdquo; is a conversation. But nobody wants to
        log in a second time to report a bug, and you don&apos;t want a third-party account system next to yours.
      </p>
      <p>
        Ozvi solves it the way most embedded tools should: your backend, which already knows who is signed in, signs a
        short statement (&ldquo;this is user u-42, sarah@…, role member&rdquo;) and the widget passes it along. Ozvi
        checks the signature and trusts it. No redirect, no password, no Ozvi account for your users.
      </p>

      <h2 id="shape">The whole flow</h2>
      <ol>
        <li>The widget calls an endpoint in <em>your</em> app, the <code>token-url</code>.</li>
        <li>Your endpoint checks your own session and returns <code>{"{ \"token\": \"…\" }"}</code>.</li>
        <li>The widget sends the token with every request to Ozvi and caches it until shortly before it expires.</li>
      </ol>
      <Code title="HTML" code={`
<script src="https://feedback.your-app.com/widget.js" defer></script>
<ozvi-widget project="your-app" token-url="/api/ozvi-token"></ozvi-widget>`} />
      <p>
        The secret that signs the token is shared between your server and Ozvi (board settings → Sign-in). It never
        goes to the browser.
      </p>

      <h2 id="token">The token is a plain JWT</h2>
      <p>
        No proprietary format: a JSON Web Token signed with HMAC-SHA256 (<code>HS256</code>), valid for ten minutes.
        That means any language can make one with its standard library.
      </p>
      <Table label="Token fields" head={["Field", "What it is"]} rows={[
        [<code key="a">id</code>, "Required. The person's stable id in your app. Ozvi keys on it, never on the e-mail alone."],
        [<code key="b">email</code>, "Optional. Used for replies (“fixed in 3.9.2, does it work for you?”)."],
        [<code key="c">name</code>, "Optional. Shown to your team."],
        [<code key="d">role</code>, "member (default), team (can triage) or admin (can change settings)."],
        [<code key="e">traits</code>, "Optional, team-only: company, plan, mrr in cents… so you can sort ideas by revenue."],
        [<><code>iat</code>, <code>exp</code></>, "Issued at and expiry, in seconds. Keep it short-lived."],
      ]} />

      <h2 id="node">Node.js</h2>
      <p>With the MIT-licensed SDK (no dependencies):</p>
      <Code title="npm i @ozvi/sdk" code={`
import { signOzviToken } from "@ozvi/sdk";

app.get("/api/ozvi-token", requireLogin, (req, res) => {
  res.json({ token: signOzviToken(
    { id: req.user.id, email: req.user.email, name: req.user.name,
      traits: { company: req.org.name, plan: req.org.plan } },
    process.env.OZVI_SSO_SECRET) });
});`} />
      <p>In Next.js the same goes into <code>app/api/ozvi-token/route.ts</code>:</p>
      <Code title="app/api/ozvi-token/route.ts" code={`
import { signOzviToken } from "@ozvi/sdk";
import { auth } from "@/auth"; // your session

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response(null, { status: 401 });
  const { id, email, name } = session.user;
  return Response.json({ token: signOzviToken({ id, email, name }, process.env.OZVI_SSO_SECRET!) });
}`} />

      <h2 id="python">Python (standard library only)</h2>
      <Code title="ozvi_token.py" code={`
import base64, hashlib, hmac, json, os, time

def ozvi_token(user: dict, secret: str = os.environ["OZVI_SSO_SECRET"]) -> str:
    b64 = lambda o: base64.urlsafe_b64encode(json.dumps(o, separators=(",", ":")).encode()).rstrip(b"=").decode()
    now = int(time.time())
    body = f'{b64({"alg": "HS256", "typ": "JWT"})}.{b64({**user, "iat": now, "exp": now + 600})}'
    sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"`} />

      <h2 id="php">PHP (no Composer package)</h2>
      <Code title="ozvi_token.php" code={`
function ozvi_token(array $user, ?string $secret = null): string {
    $secret ??= getenv('OZVI_SSO_SECRET');
    $b64 = fn($s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    $now = time();
    $body = $b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT'])) . '.'
          . $b64(json_encode($user + ['iat' => $now, 'exp' => $now + 600], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $body . '.' . $b64(hash_hmac('sha256', $body, $secret, true));
}`} />
      <p>
        All three produce tokens that Ozvi&apos;s own verifier accepts; we test them against it.
      </p>

      <h2 id="safe">Getting it right</h2>
      <ul>
        <li><strong>Keep it short-lived.</strong> Ten minutes is plenty, the widget asks for a new one when it needs it. A leaked token is useless soon after.</li>
        <li><strong>Sign only for signed-in users.</strong> Check your own session first and return 401 without it; never sign whatever the browser sends you.</li>
        <li><strong>Use your stable id</strong>, not the e-mail, as <code>id</code>. People change e-mails.</li>
        <li><strong>Roles come from you.</strong> Give <code>team</code> only to your staff: they see every report and the customer data in <code>traits</code>.</li>
        <li><strong>Don&apos;t paste real tokens into online decoders.</strong> They carry your users&apos; e-mails.</li>
      </ul>
      <Note title="More">
        Everything the widget can do, from the JavaScript API to React and Vue components: <a href="/docs/widget">widget docs</a>.
        Prefer OpenID Connect? Ozvi supports that too (board settings → Sign-in).
      </Note>
    </>
  );
}
