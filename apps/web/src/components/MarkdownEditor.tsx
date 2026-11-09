"use client";

import { Bold, Code, Italic, Link, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useImperativeHandle, useRef, useState, useSyncExternalStore, type ComponentProps, type Ref } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * A plain textarea with a tiny Markdown toolbar (bold, italic, link, list, code), the usual
 * shortcuts (⌘/Ctrl + B, I, K, E, ⇧8) and a "Náhľad" tab rendered by the same code as the board
 * (lib/markdown.ts), so what you preview is what gets published. Works controlled (value/onChange)
 * and uncontrolled inside a <form> (the textarea stays mounted while previewing, so it is submitted).
 * Edits go through execCommand("insertText") where available, which keeps the browser's undo stack.
 */

type Props = Omit<ComponentProps<"textarea">, "ref"> & {
  ref?: Ref<HTMLTextAreaElement | null>;
  /** Board slug: lets the preview show this board's attachment images. */
  slug?: string;
  /** Changelog: allow # headings. */
  headings?: boolean;
  /** No outer border: the parent already draws the box (comment form). */
  bare?: boolean;
  /** Extra classes for the outer box. */
  boxClassName?: string;
};

const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const noop = () => () => {};

function replace(el: HTMLTextAreaElement, start: number, end: number, text: string, selStart: number, selEnd: number) {
  el.focus();
  el.setSelectionRange(start, end);
  let done = false;
  try { done = document.execCommand("insertText", false, text); } catch { done = false; }
  if (!done || el.value.slice(start, start + text.length) !== text) {
    // Fallback: set the value through the native setter so React's onChange still fires.
    const v = el.value.slice(0, start) + text + el.value.slice(end);
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  el.setSelectionRange(selStart, selEnd);
}

/** Wrap the selection in `before`/`after` (or unwrap it if it already is). */
function wrap(el: HTMLTextAreaElement, before: string, after: string, placeholder: string) {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const sel = value.slice(s, e);
  if (value.slice(s - before.length, s) === before && value.slice(e, e + after.length) === after) {
    replace(el, s - before.length, e + after.length, sel, s - before.length, e - before.length);
    return;
  }
  const inner = sel || placeholder;
  replace(el, s, e, before + inner + after, s + before.length, s + before.length + inner.length);
}

function code(el: HTMLTextAreaElement, placeholder: string) {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const sel = value.slice(s, e);
  if (!sel.includes("\n")) return wrap(el, "`", "`", placeholder);
  const lead = s > 0 && value[s - 1] !== "\n" ? "\n" : "";
  const block = `${lead}\`\`\`\n${sel.replace(/\n$/, "")}\n\`\`\`\n`;
  replace(el, s, e, block, s + lead.length + 4, s + lead.length + 4 + sel.replace(/\n$/, "").length);
}

function link(el: HTMLTextAreaElement, placeholder: string) {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const sel = value.slice(s, e);
  if (/^https?:\/\/\S+$/.test(sel)) {
    replace(el, s, e, `[${placeholder}](${sel})`, s + 1, s + 1 + placeholder.length);
    return;
  }
  const label = sel || placeholder;
  const text = `[${label}](https://)`;
  const urlAt = s + label.length + 3;
  replace(el, s, e, text, urlAt, urlAt + 8);
}

/** Toggle "- " on every line touched by the selection. */
function list(el: HTMLTextAreaElement) {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const from = value.lastIndexOf("\n", s - 1) + 1;
  const toNl = value.indexOf("\n", e > s && value[e - 1] === "\n" ? e - 1 : e);
  const to = toNl < 0 ? value.length : toNl;
  const lines = value.slice(from, to).split("\n");
  const on = lines.every((l) => /^\s*[-*+]\s/.test(l) || !l.trim());
  const next = lines.map((l) => (on ? l.replace(/^(\s*)[-*+]\s/, "$1") : l.trim() ? `- ${l}` : l)).join("\n");
  replace(el, from, to, next, from, from + next.length);
}

export function MarkdownEditor({ ref, slug, headings, bare, boxClassName, className, onKeyDown, onInvalid, ...props }: Props) {
  const t = useTranslations("forms.markdown");
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle<HTMLTextAreaElement | null, HTMLTextAreaElement | null>(ref, () => area.current, []);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [html, setHtml] = useState("");
  const [height, setHeight] = useState<number | undefined>();
  const mod = useSyncExternalStore(noop, () => (isApple() ? "⌘" : "Ctrl"), () => "Ctrl");
  const id = useId();

  const run = (fn: (el: HTMLTextAreaElement) => void) => {
    const el = area.current;
    if (el && !el.disabled && !el.readOnly) fn(el);
  };
  const actions = {
    bold: () => run((el) => wrap(el, "**", "**", t("boldText"))),
    italic: () => run((el) => wrap(el, "_", "_", t("italicText"))),
    link: () => run((el) => link(el, t("linkText"))),
    list: () => run(list),
    code: () => run((el) => code(el, t("codeText"))),
  };

  const show = (next: "write" | "preview") => {
    if (next === tab) return;
    if (next === "preview") {
      setHeight(area.current?.offsetHeight);
      setHtml(renderMarkdown(area.current?.value ?? "", { slug, headings, origin: window.location.origin }));
    }
    setTab(next);
    if (next === "write") requestAnimationFrame(() => area.current?.focus());
  };

  const keys = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const act = !e.shiftKey && k === "b" ? actions.bold
      : !e.shiftKey && k === "i" ? actions.italic
      : !e.shiftKey && k === "k" ? actions.link
      : !e.shiftKey && k === "e" ? actions.code
      : e.shiftKey && (k === "8" || k === "*") ? actions.list : null;
    if (act) { e.preventDefault(); act(); }
  };

  const tools = [
    { key: "bold", icon: Bold, label: t("bold"), keys: `${mod}+B` },
    { key: "italic", icon: Italic, label: t("italic"), keys: `${mod}+I` },
    { key: "link", icon: Link, label: t("link"), keys: `${mod}+K` },
    { key: "list", icon: List, label: t("list"), keys: `${mod}+⇧+8` },
    { key: "code", icon: Code, label: t("code"), keys: `${mod}+E` },
  ] as const;

  const tabBtn = (v: "write" | "preview", label: string) => (
    <button type="button" role="tab" id={`${id}-${v}`} aria-selected={tab === v} aria-controls={`${id}-panel`}
      onClick={() => show(v)}
      onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const o = v === "write" ? "preview" : "write"; show(o); document.getElementById(`${id}-${o}`)?.focus(); } }}
      tabIndex={tab === v ? 0 : -1}
      className={cn("relative h-8 rounded-md px-2.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        tab === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
      {label}
    </button>
  );

  return (
    <div className={cn("grid min-w-0", !bare && "rounded-md border border-input bg-surface shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30", boxClassName)}>
      <div className={cn("flex min-w-0 flex-wrap items-center gap-1", bare ? "px-0.5 pb-1.5" : "border-b px-1.5 py-1")}>
        <div role="tablist" aria-label={t("mode")} className="flex items-center gap-0.5">
          {tabBtn("write", t("write"))}
          {tabBtn("preview", t("preview"))}
        </div>
        {tab === "write" && (
          <div role="toolbar" aria-label={t("toolbar")} aria-controls={props.id} className="ml-auto flex flex-wrap items-center">
            {tools.map(({ key, icon: Icon, label, keys: k }) => (
              <button key={key} type="button" title={`${label} (${k})`} aria-label={label} aria-keyshortcuts={k.replace("⌘", "Meta").replace("⇧", "Shift")}
                onMouseDown={(e) => e.preventDefault()} onClick={actions[key]}
                className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <Icon className="size-4" aria-hidden />
              </button>
            ))}
          </div>
        )}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} className="min-w-0">
        <textarea data-slot="textarea" ref={area} {...props} hidden={tab === "preview"}
          onKeyDown={keys}
          onInvalid={(e) => { onInvalid?.(e); if (tab === "preview") show("write"); }}
          className={cn(
            "flex field-sizing-content min-h-16 w-full resize-y bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            className,
          )} />
        {tab === "preview" && (
          <div className="px-3 py-2" style={{ minHeight: height }}>
            {html
              ? <div className="oz-prose oz-md text-[15px]" dangerouslySetInnerHTML={{ __html: html }} />
              : <p className="text-[14px] text-muted-foreground">{t("empty")}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
