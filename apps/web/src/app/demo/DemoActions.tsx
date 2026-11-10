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
    const r = await fetch("/api/demo/bookings/2026-11-14-1030?api_key=sk_live_demo123&draft=1", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ client: "Jana Kováčová", phone: "+421905123456", note: "Citlivá pokožka, alergia na amoniak", pin: "4711", price: 6500 }),
    }).catch(() => null);
    if (!r?.ok) { console.error(`Uloženie rezervácie zlyhalo (HTTP ${r?.status ?? 0})`); setMsg("Rezerváciu sa nepodarilo uložiť."); }
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
      <button type="button" onClick={() => go("detail")} aria-pressed={tab === "detail"}>Detail</button>
      <button type="button" onClick={() => go("historia")} aria-pressed={tab === "historia"}>História</button>
      <button type="button" onClick={save} style={{ fontWeight: 600 }}>Uložiť rezerváciu</button>
      {msg && <span role="alert" style={{ color: "#B3261E" }}>{msg}</span>}
    </div>
  );
}
