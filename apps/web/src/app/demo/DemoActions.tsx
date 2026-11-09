"use client";

import { useState } from "react";

/**
 * Something for the widget to record on the demo host app: a tab switch (route change), a save that
 * fails (POST with a secret in the URL and the body, masked in the bug report) and a successful reload.
 */
export function DemoActions() {
  const [tab, setTab] = useState("detail");
  const [msg, setMsg] = useState("");
  const go = (t: string) => { setTab(t); history.pushState(null, "", `/demo?tab=${t}`); };
  async function save() {
    setMsg("");
    await fetch("/api/health").catch(() => {});
    const r = await fetch("/api/demo/invoices/2026-0501?api_key=sk_live_demo123&draft=1", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer: "Firma s.r.o.", vatId: "SK2020123456", iban: "SK3112000000198742637541", password: "tajne-heslo", amount: 124000 }),
    }).catch(() => null);
    if (!r?.ok) { console.error(`Uloženie faktúry zlyhalo (HTTP ${r?.status ?? 0})`); setMsg("Faktúru sa nepodarilo uložiť."); }
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
      <button type="button" onClick={() => go("detail")} aria-pressed={tab === "detail"}>Detail</button>
      <button type="button" onClick={() => go("platby")} aria-pressed={tab === "platby"}>Platby</button>
      <button type="button" onClick={save} style={{ fontWeight: 600 }}>Uložiť faktúru</button>
      {msg && <span role="alert" style={{ color: "#B3261E" }}>{msg}</span>}
    </div>
  );
}
