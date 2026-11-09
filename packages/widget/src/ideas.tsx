import { useEffect, useRef, useState } from "preact/hooks";
import type { IdeasCtx } from "./index";
import { getJson, shared } from "./shared";
import { packFor } from "./lang-pack";

/**
 * widget-ideas.js, loaded the first time someone opens ideas in the widget: top ideas with search, voting
 * (the board's vote mode and budget, enforced by the server), and a new idea with similar ideas shown while
 * typing. Rendered inside the widget's shadow root with the widget's Preact (see build.mjs).
 */

const T = {
  sk: {
    search: "Hľadať v nápadoch", searchPh: "Napr. export do CSV", none: "Nič sme nenašli. Navrhnite to ako nový nápad.", empty: "Zatiaľ tu nie sú žiadne nápady.",
    suggest: "Navrhnúť nový nápad", all: "Všetky nápady na boarde", vote: "Hlasovať", voted: "Zahlasované", votes: (n: number) => `${n} ${n === 1 ? "hlas" : n >= 2 && n <= 4 ? "hlasy" : "hlasov"}`,
    weight: (w: number) => `Dôležitosť ${w} z 3`, left: (l: number, t: number) => `Zostáva vám ${l} z ${t} bodov`,
    title: "Názov nápadu", titlePh: "Napr. Opakované faktúry", body: "Čo by vám to uľahčilo?", opt: "(nepovinné)",
    similar: "Podobné nápady", similarSub: "Ak je medzi nimi váš, zahlasujte zaň. Tím tak lepšie vidí, čo chcete.",
    send: "Navrhnúť nápad", sending: "Posielam…", tag: "Nápad", queued: "Čaká na schválenie",
    queuedText: "Tím príspevky od ľudí mimo tímu pred zverejnením schvaľuje. Zatiaľ ho vidíte len vy, po schválení ho uvidia všetci. Ak ho tím nezverejní, napíšeme vám prečo.",
    sent: "Nápad je na boarde. Ostatní zaň môžu hlasovať a keď sa stav zmení, príde vám e-mail.", view: "Pozrieť nápad", back: "Späť na nápady",
    fail: "Nepodarilo sa to. Skúste to znova.", who: "Nepodarilo sa overiť, kto ste. Obnovte stránku a skúste to znova.", status: "Stav",
  },
  cs: {
    search: "Hledat v nápadech", searchPh: "Např. export do CSV", none: "Nic jsme nenašli. Navrhněte to jako nový nápad.", empty: "Zatím tu nejsou žádné nápady.",
    suggest: "Navrhnout nový nápad", all: "Všechny nápady na boardu", vote: "Hlasovat", voted: "Odhlasováno", votes: (n: number) => `${n} ${n === 1 ? "hlas" : n >= 2 && n <= 4 ? "hlasy" : "hlasů"}`,
    weight: (w: number) => `Důležitost ${w} ze 3`, left: (l: number, t: number) => `Zbývá vám ${l} z ${t} bodů`,
    title: "Název nápadu", titlePh: "Např. Opakované faktury", body: "Co by vám to usnadnilo?", opt: "(nepovinné)",
    similar: "Podobné nápady", similarSub: "Pokud je mezi nimi ten váš, hlasujte pro něj. Tým tak lépe vidí, co chcete.",
    send: "Navrhnout nápad", sending: "Odesílám…", tag: "Nápad", queued: "Čeká na schválení",
    queuedText: "Tým příspěvky od lidí mimo tým před zveřejněním schvaluje. Zatím ho vidíte jen vy, po schválení ho uvidí všichni. Pokud ho tým nezveřejní, napíšeme vám proč.",
    sent: "Nápad je na boardu. Ostatní pro něj mohou hlasovat a když se změní stav, přijde vám e-mail.", view: "Zobrazit nápad", back: "Zpět na nápady",
    fail: "Nepodařilo se to. Zkuste to znovu.", who: "Nepodařilo se ověřit, kdo jste. Obnovte stránku a zkuste to znovu.", status: "Stav",
  },
  en: {
    search: "Search ideas", searchPh: "E.g. CSV export", none: "Nothing found. Suggest it as a new idea.", empty: "No ideas yet.",
    suggest: "Suggest a new idea", all: "All ideas on the board", vote: "Vote", voted: "Voted", votes: (n: number) => `${n} ${n === 1 ? "vote" : "votes"}`,
    weight: (w: number) => `Importance ${w} of 3`, left: (l: number, t: number) => `${l} of ${t} points left`,
    title: "Idea title", titlePh: "E.g. Recurring invoices", body: "What would it make easier?", opt: "(optional)",
    similar: "Similar ideas", similarSub: "If yours is among them, vote for it. It shows the team more clearly what you want.",
    send: "Suggest idea", sending: "Sending…", tag: "Idea", queued: "Awaiting approval",
    queuedText: "The team approves posts from outside the team before publishing them. For now only you can see it; once approved, everyone can. If the team doesn't publish it, we'll e-mail you why.",
    sent: "Your idea is on the board. Others can vote for it, and you'll get an e-mail when its status changes.", view: "View idea", back: "Back to ideas",
    fail: "That didn't work. Please try again.", who: "We couldn't verify who you are. Reload the page and try again.", status: "Status",
  },
};
type Str = (typeof T)["sk"];

interface Idea { id: string; number: number; title: string; votes: number; status: string; label: string; weight: number; pending: boolean }
interface List { ideas: Idea[]; voteMode: "simple" | "importance"; budget: { total: number; left: number | null } | null; signedIn: boolean }

const CSS = `
.oi-search{margin:0 0 10px}
.oi-o{font-weight:400;opacity:.7}
.oi-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.oi-row{display:grid;grid-template-columns:52px 1fr;gap:10px;align-items:center;padding:8px;border:1px solid var(--oz-border,#ddd);border-radius:var(--oz-radius,8px)}
.oi-vote{display:grid;justify-items:center;gap:1px;width:52px;min-height:48px;padding:5px 0;border:1px solid color-mix(in srgb,var(--oz-ink,#111214) 18%,var(--oz-border,#ddd));border-radius:calc(var(--oz-radius,8px) - 2px);background:var(--oz-surface,#fff);cursor:pointer;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
.oi-vote svg{width:16px;height:16px}
.oi-vote:hover{border-color:var(--oz-accent,#5A3FE6)}
.oi-vote[aria-pressed=true]{border-color:var(--oz-accent,#5A3FE6);background:color-mix(in srgb,var(--oz-accent,#5A3FE6) 12%,var(--oz-surface,#fff));color:var(--oz-accent,#5A3FE6)}
.oi-vote[aria-busy=true]{cursor:progress}
.oi-pips{display:flex;gap:2px}.oi-pips i{width:5px;height:5px;border-radius:9px;border:1px solid currentColor}.oi-pips i.on{background:currentColor}
.oi-t{min-width:0;display:grid;gap:3px;justify-items:start}
.oi-t button{all:unset;cursor:pointer;font-size:14px;font-weight:600;line-height:1.3;overflow-wrap:anywhere;border-radius:4px}
.oi-t button:hover{text-decoration:underline}
.oi-t button:focus-visible{outline:2px solid var(--oz-accent,#5A3FE6);outline-offset:2px}
.oi-st{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;opacity:.8}
.oi-st::before{content:"";width:7px;height:7px;border-radius:9px;border:1.5px solid currentColor}
.oi-st[data-s=planned]::before{border-style:dashed}.oi-st[data-s=in_progress]::before{background:linear-gradient(90deg,currentColor 50%,transparent 50%)}.oi-st[data-s=shipped]::before{background:currentColor}
.oi-meta{font-size:12px;opacity:.75;margin:0 0 8px}
.oi-more{display:flex;justify-content:center;margin-top:10px}
.oi-link{all:unset;cursor:pointer;font-size:13px;font-weight:600;color:var(--oz-accent,#5A3FE6);padding:4px 6px;border-radius:6px}
.oi-link:hover{text-decoration:underline}.oi-link:focus-visible{outline:2px solid var(--oz-accent,#5A3FE6)}
.oi-sim{margin-top:12px;padding:10px;border-radius:var(--oz-radius,8px);background:color-mix(in srgb,var(--oz-accent,#5A3FE6) 6%,var(--oz-surface,#fff))}
.oi-sim h3{margin:0;font-size:13px;font-weight:700}.oi-sim p{margin:2px 0 8px;font-size:12px;opacity:.8}
.oi-sim .oi-row{background:var(--oz-surface,#fff)}
.oi-skel{height:66px;border-radius:var(--oz-radius,8px);background:color-mix(in srgb,var(--oz-ink,#111214) 6%,var(--oz-surface,#fff))}
`;

const up = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>;

function Row({ idea, mode, t, busy, onVote, onOpen }: { idea: Idea; mode: List["voteMode"]; t: Str; busy: boolean; onVote: (i: Idea) => void; onOpen: (i: Idea) => void }) {
  const label = `${idea.weight ? t.voted : t.vote}: ${idea.title}${mode === "importance" && idea.weight ? `. ${t.weight(idea.weight)}` : ""}`;
  return (
    <li class="oi-row">
      <button type="button" class="oi-vote" aria-pressed={idea.weight > 0} aria-label={label} aria-busy={busy} onClick={() => !busy && onVote(idea)}>
        {up}<span aria-hidden="true">{idea.votes}</span>
        {mode === "importance" && <span class="oi-pips" aria-hidden="true">{[1, 2, 3].map((n) => <i key={n} class={idea.weight >= n ? "on" : ""} />)}</span>}
      </button>
      <div class="oi-t">
        <button type="button" onClick={() => onOpen(idea)}>{idea.title}</button>
        <span class="oi-st" data-s={idea.status}><span class="sr">{t.status}: </span>{idea.pending ? t.queued : idea.label} · {t.votes(idea.votes)}</span>
      </div>
    </li>
  );
}

function Ideas({ ctx }: { ctx: IdeasCtx }) {
  const t = (T as Record<string, Str>)[ctx.lang] ?? (packFor(ctx.lang)?.ideas as Str | undefined) ?? T.en;
  const { api } = shared();
  const base = `${ctx.host}/${ctx.project}/api/widget`;
  const [list, setList] = useState<List | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Idea[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ number: number; pending: string | null } | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const pre = api.__.state.prefill?.kind === "idea" ? api.__.state.prefill : null;
  const [title, setTitle] = useState(pre?.title ?? "");

  /** Authorized when the host gives us a token, anonymous otherwise (public boards still list ideas). */
  async function get(path: string): Promise<List> {
    let auth: Record<string, string> = {};
    try { auth = { authorization: `Bearer ${await ctx.token()}` }; } catch { /* anonymous */ }
    return getJson<List>(`${base}/${path}${path.includes("?") ? "&" : "?"}lang=${ctx.lang}`, { headers: auth });
  }

  useEffect(() => { setTimeout(() => first.current?.focus(), 30); }, [ctx.view, done]);

  // The list, refreshed (debounced) while searching.
  useEffect(() => {
    if (ctx.view !== "ideas") return;
    const h = setTimeout(() => get(q.trim().length >= 3 ? `ideas?q=${encodeURIComponent(q.trim())}&limit=20` : "ideas?limit=20").then(setList, (e: Error) => setErr(e.message || t.fail)), q ? 250 : 0);
    return () => clearTimeout(h);
  }, [q, ctx.view]);

  // Similar ideas while typing a new one (the same matching as the board's search).
  useEffect(() => {
    if (ctx.view !== "idea" || title.trim().length < 3) return void setSimilar([]);
    const h = setTimeout(() => get(`ideas?q=${encodeURIComponent(title.trim())}&limit=4`).then((r) => { setList((l) => l ?? r); setSimilar(r.ideas); }, () => {}), 300);
    return () => clearTimeout(h);
  }, [title, ctx.view]);

  const mode = list?.voteMode ?? "simple";
  const patch = (id: string, f: (i: Idea) => Idea) => {
    setList((l) => l && { ...l, ideas: l.ideas.map((i) => (i.id === id ? f(i) : i)) });
    setSimilar((s) => s.map((i) => (i.id === id ? f(i) : i)));
  };

  async function vote(idea: Idea) {
    // Simple: toggle. Importance: 0 → 1 → 2 → 3 → 0. The server decides the real weight and guards the budget.
    const want = mode === "importance" ? (idea.weight + 1) % 4 : idea.weight ? 0 : 1;
    setBusy(idea.id); setErr("");
    try {
      const tok = await ctx.token().catch(() => { throw new Error(t.who); });
      const r = await getJson<{ weight: number; votes: number; left: number | null }>(`${base}/vote?lang=${ctx.lang}`, {
        method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ id: idea.id, weight: want }),
      });
      patch(idea.id, (i) => ({ ...i, weight: r.weight, votes: r.votes }));
      setList((l) => l && l.budget ? { ...l, budget: { ...l.budget, left: r.left } } : l);
    } catch (e) {
      const message = (e as Error).message || t.fail;
      setErr(message);
      api.__.emit("error", { kind: "vote", message });
    } finally { setBusy(null); }
  }

  async function submit(e: Event) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    f.set("kind", "idea");
    setSending(true); setErr("");
    api.__.emit("submit", { kind: "idea", title });
    try {
      const tok = await ctx.token().catch(() => { throw new Error(t.who); });
      const r = await getJson<{ number: number; url: string; pending: string | null }>(`${base}/items?lang=${ctx.lang}`, { method: "POST", body: f, headers: { authorization: `Bearer ${tok}` } });
      if (pre) api.__.state.prefill = null;
      setDone({ number: r.number, pending: r.pending ?? null });
      setTitle(""); setList(null);
      api.__.emit("submitted", { kind: "idea", number: r.number, url: `${ctx.host}${r.url}`, pending: r.pending ?? null });
    } catch (e) {
      const message = (e as Error).message || t.fail;
      setErr(message);
      api.__.emit("error", { kind: "idea", message });
    } finally { setSending(false); }
  }

  const open = (i: Idea) => ctx.openBoard(`/i/${i.number}`);
  const rows = (ideas: Idea[]) => (
    <ul class="oi-list">{ideas.map((i) => <Row key={i.id} idea={i} mode={mode} t={t} busy={busy === i.id} onVote={vote} onOpen={open} />)}</ul>
  );
  const error = err && <p class="err" role="alert">{err}</p>;

  if (done) {
    return (
      <>
        <style nonce={shared().nonce}>{CSS}</style>
        <div class="tag"><span>{done.pending ? t.queued : t.tag}</span><b>#{done.number}</b></div>
        <p role="status">{done.pending ? t.queuedText : t.sent}</p>
        <button class="btn" onClick={() => ctx.openBoard(`/i/${done.number}`)}>{t.view}</button>
        <div class="oi-more"><button class="oi-link" onClick={() => { setDone(null); ctx.setView("ideas"); }}>{t.back}</button></div>
      </>
    );
  }

  if (ctx.view === "idea") {
    return (
      <form onSubmit={submit}>
        <style nonce={shared().nonce}>{CSS}</style>
        <label for="oi-t">{t.title}</label>
        <input id="oi-t" ref={first} name="title" required minLength={3} maxLength={200} placeholder={t.titlePh} value={title} onInput={(e) => setTitle(e.currentTarget.value)} autocomplete="off" />
        {similar.length > 0 && (
          <section class="oi-sim" aria-labelledby="oi-sim-h">
            <h3 id="oi-sim-h">{t.similar}</h3>
            <p>{t.similarSub}</p>
            {rows(similar)}
          </section>
        )}
        <label for="oi-b">{t.body} <span class="oi-o">{t.opt}</span></label>
        <textarea id="oi-b" name="body" maxLength={10000} defaultValue={pre?.body} />
        {error}
        <button class="btn" disabled={sending}>{sending ? t.sending : t.send}</button>
      </form>
    );
  }

  const searching = q.trim().length >= 3;
  return (
    <>
      <style nonce={shared().nonce}>{CSS}</style>
      <div class="oi-search">
        <label for="oi-q" class="sr">{t.search}</label>
        <input id="oi-q" ref={first} type="search" placeholder={t.searchPh} value={q} onInput={(e) => setQ(e.currentTarget.value)} autocomplete="off" />
      </div>
      {list?.budget && list.budget.left != null && <p class="oi-meta">{t.left(list.budget.left, list.budget.total)}</p>}
      {error}
      {!list && !err && <div aria-busy="true" class="oi-list">{[0, 1, 2].map((n) => <div key={n} class="oi-skel" />)}</div>}
      {list && (list.ideas.length ? rows(list.ideas) : <p class="muted" role="status">{searching ? t.none : t.empty}</p>)}
      <button class="btn" onClick={() => { if (searching) setTitle(q.trim()); ctx.setView("idea"); }}>{t.suggest}</button>
      <div class="oi-more"><button class="oi-link" onClick={() => ctx.openBoard("/ideas")}>{t.all}</button></div>
    </>
  );
}

(window as unknown as { __ozviIdeas: typeof Ideas }).__ozviIdeas = Ideas;
