import { packFor } from "./lang-pack";
/**
 * Screenshot annotation, loaded on demand (widget-annotate.js) so widget.js stays small.
 * Boxes, arrows, highlights and blur. Blur is pixelation burned into the pixels of the exported JPEG:
 * the original screenshot is replaced, so the hidden part never leaves the browser.
 *
 * Keyboard: pick a tool, Enter on the canvas adds a shape in the middle, arrows move it, Shift+arrows
 * resize it, Delete removes it, Ctrl/Cmd+Z undoes, Escape keeps the screenshot as it was.
 */

type Tool = "box" | "arrow" | "mark" | "blur";
interface Shape { t: Tool; x: number; y: number; w: number; h: number }
type Lang = string;

const T = {
  sk: {
    title: "Označte, čo nefunguje", hint: "Ťahaním kreslite. Rozmazanie sa natrvalo prenesie do obrázka ešte pred odoslaním.",
    tools: "Nástroje", box: "Rámik", arrow: "Šípka", mark: "Zvýrazniť", blur: "Rozmazať", undo: "Späť", skip: "Bez úprav", done: "Použiť",
    canvas: "Screenshot. Enter pridá tvar do stredu, šípky ho posúvajú, Shift a šípky menia veľkosť, Delete ho odstráni.",
    added: "Pridané: ", moved: "Posunuté", removed: "Odstránené", undone: "Vrátené späť", none: "Nie je čo vrátiť",
  },
  cs: {
    title: "Označte, co nefunguje", hint: "Tažením kreslete. Rozmazání se natrvalo přenese do obrázku ještě před odesláním.",
    tools: "Nástroje", box: "Rámeček", arrow: "Šipka", mark: "Zvýraznit", blur: "Rozmazat", undo: "Zpět", skip: "Bez úprav", done: "Použít",
    canvas: "Snímek obrazovky. Enter přidá tvar doprostřed, šipky ho posouvají, Shift a šipky mění velikost, Delete ho odstraní.",
    added: "Přidáno: ", moved: "Posunuto", removed: "Odstraněno", undone: "Vráceno zpět", none: "Není co vrátit",
  },
  en: {
    title: "Mark what isn't working", hint: "Drag to draw. Blur is burned into the image before it is sent.",
    tools: "Tools", box: "Box", arrow: "Arrow", mark: "Highlight", blur: "Blur", undo: "Undo", skip: "Use as is", done: "Apply",
    canvas: "Screenshot. Enter adds a shape in the middle, arrow keys move it, Shift and arrow keys resize it, Delete removes it.",
    added: "Added: ", moved: "Moved", removed: "Removed", undone: "Undone", none: "Nothing to undo",
  },
};

const ICONS: Record<Tool | "undo", string> = {
  box: "M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2z",
  arrow: "M5 19L19 5M19 5h-8M19 5v8",
  mark: "M4 20h16M7 16l9.5-9.5a2.1 2.1 0 013 3L10 19H7z",
  blur: "M4 4h4v4H4zM12 4h4v4h-4zM8 8h4v4H8zM16 8h4v4h-4zM4 12h4v4H4zM12 12h4v4h-4zM8 16h4v4H8zM16 16h4v4h-4z",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11",
};

const CSS = `
.oza{position:fixed;inset:0;z-index:2147483001;display:flex;flex-direction:column;gap:12px;padding:16px;background:rgba(10,10,15,.94);color:#fff;font-family:var(--oz-font-body,system-ui,sans-serif);animation:oz-in .2s cubic-bezier(.16,1,.3,1)}
.oza h2{margin:0;font-family:var(--oz-font-heading,inherit);font-size:16px;font-weight:700;color:#fff}.oza h2:focus{outline:none}
.oza p{margin:2px 0 0;font-size:12.5px;opacity:.8;color:#fff}
.oza-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.oza-tools,.oza-act{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.oza button{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 12px;border:1px solid rgba(255,255,255,.22);border-radius:var(--oz-radius,8px);background:rgba(255,255,255,.08);color:#fff;font-size:13px;font-weight:600;cursor:pointer}
.oza button:hover{background:rgba(255,255,255,.16)}
.oza button[aria-pressed=true]{background:#fff;color:#111214;border-color:#fff}
.oza button.go{background:var(--oz-accent,#5A3FE6);color:var(--oz-on-accent,#fff);border-color:transparent}
.oza button:focus-visible,.oza canvas:focus-visible{outline:2px solid #fff;outline-offset:2px}
.oza-stage{position:relative;flex:1;min-height:0}
.oza canvas{position:absolute;inset:0;margin:auto;max-width:100%;max-height:100%;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.5);touch-action:none;cursor:crosshair;background:#fff}
@media (max-width:560px){.oza{padding:12px;gap:10px}.oza button{padding:0 10px}.oza .lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}}
`;

const icon = (d: string) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

/** Normalised rectangle (positive size, inside the image). */
function rect(s: Shape, W: number, H: number) {
  let { x, y, w, h } = s;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  x = Math.max(0, x); y = Math.max(0, y);
  return { x, y, w: Math.min(w, W - x), h: Math.min(h, H - y) };
}

/** Coarse pixelation: irreversible, works in every browser (canvas `filter` does not in Safari). */
function pixelate(ctx: CanvasRenderingContext2D, s: Shape, W: number, H: number) {
  const r = rect(s, W, H);
  if (r.w < 1 || r.h < 1) return;
  const block = Math.max(12, Math.round(Math.max(W, H) / 80));
  const tmp = document.createElement("canvas");
  tmp.width = Math.max(1, Math.ceil(r.w / block));
  tmp.height = Math.max(1, Math.ceil(r.h / block));
  tmp.getContext("2d")!.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, tmp.width, tmp.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, r.x, r.y, r.w, r.h);
  ctx.imageSmoothingEnabled = true;
}

function draw(ctx: CanvasRenderingContext2D, img: CanvasImageSource, shapes: Shape[], sel: Shape | null) {
  const { width: W, height: H } = ctx.canvas;
  const lw = Math.max(3, Math.round(W / 320));
  ctx.drawImage(img, 0, 0, W, H);
  for (const s of shapes) if (s.t === "blur") pixelate(ctx, s, W, H);
  for (const s of shapes) {
    const r = rect(s, W, H);
    ctx.lineWidth = lw;
    ctx.strokeStyle = "#E5484D";
    ctx.lineCap = ctx.lineJoin = "round";
    if (s.t === "box") ctx.strokeRect(r.x, r.y, r.w, r.h);
    else if (s.t === "mark") { ctx.fillStyle = "rgba(255,213,0,.38)"; ctx.fillRect(r.x, r.y, r.w, r.h); }
    else if (s.t === "arrow") {
      const [x1, y1, x2, y2] = [s.x, s.y, s.x + s.w, s.y + s.h];
      const a = Math.atan2(y2 - y1, x2 - x1);
      const head = lw * 5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
      ctx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
      ctx.closePath(); ctx.fillStyle = "#E5484D"; ctx.fill();
    }
  }
  if (sel) {
    const r = rect(sel, W, H);
    ctx.save();
    // Selection outline (preview only, never exported): white over black dashes reads on any screenshot.
    ctx.lineWidth = Math.max(2, lw / 2);
    for (const [c, off] of [["#000", 0], ["#fff", lw * 2]] as const) {
      ctx.setLineDash([lw * 2, lw * 2]); ctx.lineDashOffset = off; ctx.strokeStyle = c;
      ctx.strokeRect(r.x - lw * 2, r.y - lw * 2, r.w + lw * 4, r.h + lw * 4);
    }
    ctx.restore();
  }
}

/** Opens the editor over the page; resolves with the annotated JPEG, or null when the reporter keeps the original. */
function annotate(blob: Blob, mount: ShadowRoot | HTMLElement, lang: Lang): Promise<Blob | null> {
  const t = (T as Record<string, (typeof T)["en"]>)[lang] ?? (packFor(lang)?.annotate as (typeof T)["en"] | undefined) ?? T.en;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight;
      const root = document.createElement("div");
      root.className = "oza";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-labelledby", "oza-h");
      root.setAttribute("aria-describedby", "oza-d");
      const tools: Tool[] = ["box", "arrow", "mark", "blur"];
      root.innerHTML = `<style nonce="${(window as unknown as { __ozviP?: { nonce: string } }).__ozviP?.nonce ?? ""}">${CSS}.oza-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}</style>
<div class="oza-bar"><div><h2 id="oza-h" tabindex="-1">${t.title}</h2><p id="oza-d">${t.hint}</p></div></div>
<div class="oza-bar"><div class="oza-tools" role="group" aria-label="${t.tools}">${tools.map((k) => `<button type="button" data-t="${k}" aria-pressed="${k === "box"}">${icon(ICONS[k])}<span class="lbl">${t[k]}</span></button>`).join("")}</div>
<div class="oza-act"><button type="button" data-a="undo">${icon(ICONS.undo)}<span class="lbl">${t.undo}</span></button><button type="button" data-a="skip">${t.skip}</button><button type="button" class="go" data-a="done">${t.done}</button></div></div>
<div class="oza-stage"><canvas tabindex="0" role="img" aria-label="${t.canvas}"></canvas></div>
<span role="status" class="oza-sr"></span>`;
      const canvas = root.querySelector("canvas")!;
      const live = root.querySelector("[role=status]")!;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      const shapes: Shape[] = [];
      let tool: Tool = "box";
      let sel: Shape | null = null;
      let drag: Shape | null = null;
      const say = (s: string) => { live.textContent = ""; setTimeout(() => (live.textContent = s), 20); };
      const redraw = () => draw(ctx, img, shapes, sel);
      const prev = (mount as ShadowRoot).activeElement ?? document.activeElement;

      const finish = (out: Blob | null) => {
        root.remove();
        URL.revokeObjectURL(url);
        (prev as HTMLElement | null)?.focus?.();
        resolve(out);
      };
      const done = () => {
        if (!shapes.length) return finish(null);
        sel = null; redraw();
        canvas.toBlob((b) => finish(b), "image/jpeg", 0.85);
      };
      const undo = () => {
        if (!shapes.length) return say(t.none);
        shapes.pop(); sel = shapes.at(-1) ?? null; redraw(); say(t.undone);
      };

      root.querySelectorAll<HTMLButtonElement>("[data-t]").forEach((b) => b.addEventListener("click", () => {
        tool = b.dataset.t as Tool;
        root.querySelectorAll("[data-t]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      }));
      root.querySelector("[data-a=undo]")!.addEventListener("click", undo);
      root.querySelector("[data-a=skip]")!.addEventListener("click", () => finish(null));
      root.querySelector("[data-a=done]")!.addEventListener("click", done);

      // Pointer: drag to draw (mouse, pen and touch alike).
      const at = (e: PointerEvent) => {
        const b = canvas.getBoundingClientRect();
        return [(e.clientX - b.left) * (W / b.width), (e.clientY - b.top) * (H / b.height)] as const;
      };
      canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        const [x, y] = at(e);
        drag = { t: tool, x, y, w: 0, h: 0 };
        shapes.push(drag); sel = drag;
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const [x, y] = at(e);
        drag.w = x - drag.x; drag.h = y - drag.y; redraw();
      });
      const up = () => {
        if (!drag) return;
        const min = Math.max(6, W / 150);
        if (Math.abs(drag.w) < min && Math.abs(drag.h) < min) { shapes.pop(); sel = shapes.at(-1) ?? null; }
        else say(t.added + t[drag.t]);
        drag = null; redraw();
      };
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", up);

      // Keyboard on the canvas: add, move, resize, delete.
      canvas.addEventListener("keydown", (e) => {
        const step = Math.round((e.altKey ? 0.005 : 0.025) * Math.max(W, H));
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const w = W * (tool === "arrow" ? 0.12 : 0.25), h = H * (tool === "arrow" ? 0.12 : 0.18);
          sel = tool === "arrow" ? { t: tool, x: W / 2 - w, y: H / 2 - h, w, h } : { t: tool, x: (W - w) / 2, y: (H - h) / 2, w, h };
          shapes.push(sel); redraw(); say(t.added + t[tool]);
          return;
        }
        if (!sel) return;
        const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const v = d[e.key];
        if (v) {
          e.preventDefault();
          if (e.shiftKey) { sel.w += v[0]; sel.h += v[1]; } else { sel.x += v[0]; sel.y += v[1]; }
          redraw();
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          shapes.splice(shapes.indexOf(sel), 1); sel = shapes.at(-1) ?? null; redraw(); say(t.removed);
        }
      });

      // Dialog keys: Escape keeps the original, Ctrl/Cmd+Z undoes, Tab stays inside.
      root.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); finish(null); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
        else if (e.key === "Tab") {
          const f = [...root.querySelectorAll<HTMLElement>("button,canvas")];
          const a = (mount as ShadowRoot).activeElement ?? document.activeElement;
          const i = f.indexOf(a as HTMLElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1)!.focus(); }
          else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]!.focus(); }
        }
      });

      mount.appendChild(root);
      redraw();
      (root.querySelector("h2") as HTMLElement).focus();
    };
    img.src = url;
  });
}

(window as unknown as { __ozviAnnotate: typeof annotate }).__ozviAnnotate = annotate;
export {};
