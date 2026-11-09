import { notFound } from "next/navigation";
import Script from "next/script";
import { devEnabled } from "@/lib/dev";
import { DemoActions } from "./DemoActions";
import { DemoApi } from "./DemoApi";

export const dynamic = "force-dynamic";

/** The documented snippet (packages/widget/README.md): calls made before widget.js loads are queued. */
const STUB = `(function(w,m){var o=w.Ozvi=w.Ozvi||function(){(o.q=o.q||[]).push(arguments)};o.q=o.q||[];m.forEach(function(k){o[k]=o[k]||function(){o.q.push([k].concat([].slice.call(arguments)))}})})(window,["init","open","close","toggle","prefill","identify","logout","setTraits","setLanguage","on","off","configure"])`;

/** A fake host app (invoice screen) to try the widget the way Billiwo would embed it. */
export default function Demo() {
  if (!devEnabled()) notFound();
  return (
    <main id="main" tabIndex={-1} style={{ fontFamily: "system-ui, sans-serif", background: "#f4f5f9", minHeight: "100vh", padding: "32px clamp(16px, 4vw, 32px) 120px", color: "#1B1830" }}>
      <script dangerouslySetInnerHTML={{ __html: STUB }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center", maxWidth: 1100, margin: "0 0 16px" }}>
        <h1 style={{ margin: 0 }}>Faktúra 2026-0501</h1>
        {/* @ts-expect-error custom element */}
        <ozvi-changelog project="billiwo" mode="badge" align="end" limit="3" />
      </div>
      <div style={{ background: "#fff", borderRadius: 12, padding: 20, maxWidth: 560, border: "1px solid #ddd" }}>
        <p><b>Odberateľ:</b> Firma s.r.o.</p>
        <p><b>IČ DPH:</b> <span data-ozvi-mask>SK2020123456</span></p>
        <p><b>IBAN:</b> <span data-ozvi-mask>SK31 1200 0000 1987 4263 7541</span></p>
        <p><b>Suma:</b> 1 240,00 €</p>
        <label>Heslo k exportu <input type="password" defaultValue="tajne-heslo" /></label>
        <DemoActions />
      </div>
      <DemoApi />
      <p style={{ marginTop: 24, maxWidth: 560, opacity: 0.7 }}>
        Toto je ukážková hostiteľská appka. IČ DPH, IBAN a heslo sú označené <code>data-ozvi-mask</code> a na screenshote budú rozmazané.
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
