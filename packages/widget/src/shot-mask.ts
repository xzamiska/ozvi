import { sensitiveRanges } from "../../sdk/src/mask";

/**
 * Privacy for screenshots. Runs on the COPY of the page the screenshot is drawn from (never on the
 * page itself), before any pixel exists, so nothing covered here can be recovered from the image:
 * covered text is drawn transparent on a solid box, covered media are not drawn at all.
 *
 * - "auto" (default): values of every input, textarea and select; e-mail addresses, phone numbers,
 *   IBANs, card numbers and tokens found in text (sdk/mask sensitiveRanges); everything inside
 *   [data-ozvi-mask] (text, images, canvas, video).
 * - "all": every text and image, except inside [data-ozvi-unmask]; form values always.
 */
export type ShotMask = "auto" | "all";

const BOX = "#3A3946";
const SKIP = new Set(["STYLE", "SCRIPT", "NOSCRIPT", "TEMPLATE", "svg", "SVG"]);
const MEDIA = "img,picture,video,canvas,iframe,object,embed,svg";
const KEEP_INPUT = new Set(["checkbox", "radio", "range", "color", "button", "submit", "reset", "image", "file", "hidden"]);

/** Solid box over an element: its text turns transparent (still takes the same space), media vanish. */
function cover(el: HTMLElement): void {
  el.style.setProperty("background", BOX, "important");
  el.style.setProperty("background-image", "none", "important");
  el.style.setProperty("border-radius", "4px", "important");
  el.style.setProperty("box-shadow", "none", "important");
  for (const n of [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))]) {
    n.style.setProperty("color", "transparent", "important");
    n.style.setProperty("-webkit-text-fill-color", "transparent", "important");
    n.style.setProperty("text-shadow", "none", "important");
    n.style.setProperty("caret-color", "transparent", "important");
    if (n !== el && n.style) n.style.setProperty("background-image", "none", "important");
  }
  el.querySelectorAll<HTMLElement>(MEDIA).forEach((m) => m.style.setProperty("visibility", "hidden", "important"));
  if (el.matches(MEDIA)) el.style.setProperty("visibility", "hidden", "important");
}

/** Replace part of a text node by covered spans: [before][covered][between][covered]…[after]. */
function coverRanges(t: Text, ranges: [number, number][]): void {
  const doc = t.ownerDocument;
  const s = t.data;
  const frag = doc.createDocumentFragment();
  let at = 0;
  for (const [a, b] of ranges) {
    if (a > at) frag.append(s.slice(at, a));
    const span = doc.createElement("span");
    span.textContent = s.slice(a, b);
    span.setAttribute("data-ozvi-covered", "");
    cover(span);
    frag.append(span);
    at = b;
  }
  if (at < s.length) frag.append(s.slice(at));
  t.replaceWith(frag);
}

/** Form fields: the value never reaches the image; a non-empty field shows a few dots. */
function maskFields(root: Element): void {
  root.querySelectorAll("input").forEach((i) => {
    if (KEEP_INPUT.has(i.type)) return;
    const had = i.value || i.getAttribute("value");
    const dots = had ? "•••••" : "";
    i.value = dots;
    i.setAttribute("value", dots);
  });
  root.querySelectorAll("textarea").forEach((a) => {
    const dots = a.value || a.textContent ? "•••••" : "";
    a.value = dots;
    a.textContent = dots;
  });
  root.querySelectorAll("select").forEach((sel) => cover(sel as HTMLElement));
  root.querySelectorAll<HTMLElement>("[contenteditable]:not([contenteditable=false])").forEach(cover);
}

const inside = (n: Node, sel: string) => !!(n.parentElement ?? (n as Element)).closest?.(sel);

export function maskScreenshot(root: Element, mode: ShotMask = "auto"): void {
  maskFields(root);
  root.querySelectorAll<HTMLElement>("[data-ozvi-mask]").forEach(cover);

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentElement;
      if (!p || SKIP.has(p.tagName) || p.closest("[data-ozvi-mask],[data-ozvi-covered],textarea")) return NodeFilter.FILTER_REJECT;
      return (n as Text).data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);

  for (const t of texts) {
    if (mode === "all" && !inside(t, "[data-ozvi-unmask]")) {
      coverRanges(t, [[0, t.data.length]]);
      continue;
    }
    const r = sensitiveRanges(t.data);
    if (r.length) coverRanges(t, r);
  }
  if (mode === "all") {
    root.querySelectorAll<HTMLElement>(MEDIA).forEach((m) => { if (!m.closest("[data-ozvi-unmask]")) cover(m); });
  }
}
