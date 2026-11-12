import { demoMetadata } from "./meta";
import { notFound } from "next/navigation";
import Script from "next/script";
import { devEnabled } from "@/lib/dev";
import { DemoActions } from "./DemoActions";
import { DemoApi } from "./DemoApi";
import { PublicDemo } from "./PublicDemo";

export const dynamic = "force-dynamic";

export const generateMetadata = () => demoMetadata("sk");

/** The documented snippet (packages/widget/README.md): calls made before widget.js loads are queued. */
const STUB = `(function(w,m){var o=w.Ozvi=w.Ozvi||function(){(o.q=o.q||[]).push(arguments)};o.q=o.q||[];m.forEach(function(k){o[k]=o[k]||function(){o.q.push([k].concat([].slice.call(arguments)))}})})(window,["init","open","close","toggle","prefill","identify","logout","setTraits","setLanguage","on","off","configure"])`;

/** A fake host app (a booking in a salon calendar) to try the widget the way a customer would embed it. */
export default async function Demo() {
  // ozvi.io/demo: the same host app, but the widget only pretends to send (mock.ts).
  if (!devEnabled()) return process.env.OZVI_MODE === "cloud" ? <PublicDemo locale="sk" /> : notFound();
  return (
    <main id="main" tabIndex={-1} style={{ fontFamily: "system-ui, sans-serif", background: "#f4f5f9", minHeight: "100vh", padding: "32px clamp(16px, 4vw, 32px) 120px", color: "#1B1830" }}>
      <script dangerouslySetInnerHTML={{ __html: STUB }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center", maxWidth: 1100, margin: "0 0 16px" }}>
        <h1 style={{ margin: 0 }}>Rezervácia 14. 11. · 10:30</h1>
        {/* @ts-expect-error custom element */}
        <ozvi-changelog project="billiwo" mode="badge" align="end" limit="3" />
      </div>
      <div style={{ background: "#fff", borderRadius: 12, padding: 20, maxWidth: 560, border: "1px solid #ddd" }}>
        <p><b>Klient:</b> Jana Kováčová</p>
        <p><b>Telefón:</b> <span data-ozvi-mask>+421 905 123 456</span></p>
        <p><b>Poznámka:</b> <span data-ozvi-mask>Citlivá pokožka, alergia na amoniak</span></p>
        <p><b>Služba:</b> Farbenie · Lucia · 65,00 €</p>
        <label>PIN pobočky <input type="password" defaultValue="4711" /></label>
        <DemoActions />
      </div>
      <DemoApi />
      <p style={{ marginTop: 24, maxWidth: 560, opacity: 0.7 }}>
        Toto je ukážková hostiteľská appka. Telefón a PIN zakryje screenshot sám, poznámka je označená <code>data-ozvi-mask</code>.
      </p>
      <section aria-label="Vložené prvky" style={{ maxWidth: 1100, marginTop: 32, display: "grid", gap: 32 }}>
        {/* @ts-expect-error custom element */}
        <ozvi-roadmap project="billiwo" limit="3" />
        <div style={{ maxWidth: 640 }}>
          {/* @ts-expect-error custom element */}
          <ozvi-changelog project="billiwo" limit="2" />
        </div>
      </section>
      {/* @ts-expect-error custom element */}
      <ozvi-widget project="billiwo" token-url="/api/dev/token" app-version="2.15.0" />
      {/* Host configuration: masked bodies of failed requests, and a session link the team sees as a button. */}
      <script dangerouslySetInnerHTML={{ __html: `window.OzviConfig={networkBodies:true,links:{sentry:"https://acme.sentry.io/replays/0f3c2a9d/"}}` }} />
      <Script src="/widget.js" strategy="afterInteractive" />
    </main>
  );
}
