"use client";

import { useEffect, useState } from "react";

type Fn = (...a: never[]) => unknown;
type OzviLike = { [k in "open" | "toggle" | "prefill" | "setLanguage" | "setTraits" | "on" | "off"]: (...a: unknown[]) => unknown } & Record<string, Fn>;
const ozvi = () => (window as unknown as { Ozvi: OzviLike }).Ozvi;
const EVENTS = ["open", "close", "submit", "submitted", "error"] as const;

/**
 * The JavaScript API on the demo host app: buttons calling window.Ozvi and a log of its events.
 * Subscribes through the snippet stub (page.tsx), so it works even before widget.js has loaded.
 */
export function DemoApi() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    const add = (name: string) => (d: unknown) =>
      setLog((l) => [`${new Date().toLocaleTimeString("sk-SK")}  ${name} ${JSON.stringify(d)}`, ...l].slice(0, 12));
    const handlers = EVENTS.map((e) => [e, add(e)] as const);
    handlers.forEach(([e, h]) => ozvi().on(e, h));
    return () => handlers.forEach(([e, h]) => ozvi().off(e, h));
  }, []);

  const btn = "inline-flex min-h-9 items-center rounded-md border border-[#ccc] bg-white px-3 text-sm font-medium hover:border-[#5A3FE6]";
  return (
    <section aria-labelledby="api-h" style={{ background: "#fff", borderRadius: 12, padding: 20, maxWidth: 560, border: "1px solid #ddd", marginTop: 16 }}>
      <h2 id="api-h" style={{ margin: "0 0 4px", fontSize: 18 }}>JavaScript API</h2>
      <p style={{ margin: "0 0 12px", opacity: 0.75, fontSize: 14 }}>Tlačidlá volajú <code>window.Ozvi</code>; udalosti sa vypisujú nižšie.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className={btn} onClick={() => ozvi().open("ideas")}>Ozvi.open(&quot;ideas&quot;)</button>
        <button type="button" className={btn} onClick={() => ozvi().open("bug")}>Ozvi.open(&quot;bug&quot;)</button>
        <button type="button" className={btn} onClick={() => { ozvi().prefill({ kind: "idea", title: "Presunúť celý deň naraz", body: "Keď je kaderníčka chorá, potrebujem presunúť všetky jej termíny naraz." }); ozvi().open("idea"); }}>prefill + open(&quot;idea&quot;)</button>
        <button type="button" className={btn} onClick={() => { ozvi().prefill({ title: "Uloženie rezervácie zlyhalo" }); ozvi().open("bug"); }}>prefill + open(&quot;bug&quot;)</button>
        <button type="button" className={btn} onClick={() => ozvi().toggle()}>Ozvi.toggle()</button>
        <button type="button" className={btn} onClick={() => ozvi().setLanguage("en")}>setLanguage(&quot;en&quot;)</button>
        <button type="button" className={btn} onClick={() => ozvi().setLanguage("sk")}>setLanguage(&quot;sk&quot;)</button>
        <button type="button" className={btn} onClick={() => ozvi().setTraits({ plan: "Pro", company: "Firma s.r.o." })}>setTraits(…)</button>
      </div>
      <h3 style={{ margin: "16px 0 6px", fontSize: 14 }}>Udalosti</h3>
      <ol aria-live="polite" style={{ margin: 0, padding: 10, minHeight: 64, listStyle: "none", background: "#f4f5f9", borderRadius: 8, fontFamily: "ui-monospace, monospace", fontSize: 12, overflowWrap: "anywhere" }}>
        {log.length ? log.map((l, i) => <li key={`${i}-${l}`}>{l}</li>) : <li style={{ opacity: 0.7 }}>Zatiaľ nič. Otvorte widget.</li>}
      </ol>
    </section>
  );
}
