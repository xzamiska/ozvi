"use client";

import { FileText, ImageUp, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useLocale, useTranslations } from "next-intl";
import { fileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

const noop = () => () => {};
const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** Phones and tablets: no dragging, no keyboard shortcut. */
const isTouch = () => window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain"];

interface Item { file: File; url: string | null; key: string }

/**
 * Drop, browse or paste (Ctrl/⌘+V) files. Keeps the real <input type=file name=…> in sync so the
 * server action receives them unchanged; the server validates again by bytes.
 */
export function FileDrop({ name = "files", label, hint }: { name?: string; label: string; hint: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const locale = useLocale();
  const tf = useTranslations("forms");
  const t = useTranslations("forms.files");

  const sync = useCallback((next: Item[]) => {
    const dt = new DataTransfer();
    next.forEach((i) => dt.items.add(i.file));
    if (input.current) input.current.files = dt.files;
    setItems(next);
  }, []);

  const add = useCallback((files: File[]) => {
    setError("");
    const accepted: Item[] = [];
    for (const f of files) {
      const okType = ACCEPT.includes(f.type) || /\.(log|txt)$/i.test(f.name);
      if (!okType) { setError(t("unsupported", { name: f.name })); continue; }
      if (f.size > MAX_BYTES) { setError(t("tooBig", { name: f.name, size: fileSize(f.size, locale) })); continue; }
      const named = f.name === "image.png" && f.type.startsWith("image/")
        ? new File([f], `screenshot-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`, { type: f.type })
        : f;
      accepted.push({ file: named, url: named.type.startsWith("image/") ? URL.createObjectURL(named) : null, key: `${named.name}-${named.size}-${Math.random()}` });
    }
    setItems((prev) => {
      const room = MAX_FILES - prev.length;
      if (accepted.length > room) setError(t("tooMany", { max: MAX_FILES }));
      const next = [...prev, ...accepted.slice(0, Math.max(0, room))];
      const dt = new DataTransfer();
      next.forEach((i) => dt.items.add(i.file));
      if (input.current) input.current.files = dt.files;
      return next;
    });
  }, [t, locale]);

  // Paste a screenshot anywhere in the form's page — the fastest way to attach one.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) { e.preventDefault(); add(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  useEffect(() => () => items.forEach((i) => i.url && URL.revokeObjectURL(i.url)), [items]);

  const remove = (key: string) => {
    const gone = items.find((i) => i.key === key);
    if (gone?.url) URL.revokeObjectURL(gone.url);
    sync(items.filter((i) => i.key !== key));
    setError("");
  };

  const mod = useSyncExternalStore(noop, () => (isApple() ? "⌘" : "Ctrl"), () => "Ctrl");
  const touch = useSyncExternalStore(noop, isTouch, () => false);

  return (
    <div className="grid gap-2">
      <span className="text-[14px] font-semibold" id={`${id}-l`}>{label} <span className="font-normal text-muted-foreground">{tf("optional")}</span></span>
      <label
        htmlFor={id}
        data-over={over || undefined}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); }}
        className={cn(
          "grid cursor-pointer justify-items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-line-strong bg-wash px-4 py-6 text-center transition-colors",
          "hover:border-brand hover:bg-brand-soft/50 focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/20",
          over && "border-brand bg-brand-soft",
        )}
      >
        <ImageUp className="size-5 text-muted-foreground" />
        {touch
          ? <span className="text-[14px]"><span className="font-semibold text-brand-text underline underline-offset-2">{t("pick")}</span> {t("orPhoto")}</span>
          : <span className="text-[14px]"><b className="font-semibold">{t("drag")}</b>, <span className="text-brand-text underline underline-offset-2">{t("browse")}</span> {t("orPaste")} <kbd>{mod}</kbd>&nbsp;+&nbsp;<kbd>V</kbd></span>}
        <span className="text-[12.5px] text-pretty text-muted-foreground">{hint}</span>
        <input ref={input} id={id} name={name} type="file" multiple className="sr-only" aria-labelledby={`${id}-l`}
          accept={[...ACCEPT, ".log", ".txt"].join(",")}
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; add(f); }} />
      </label>
      {error && <p className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={t("attached")}>
          {items.map((i) => (
            <li key={i.key} className="group relative overflow-hidden rounded-lg border bg-surface">
              {i.url ? <img src={i.url} alt="" className="aspect-[4/3] w-full object-cover object-top" />
                : <span className="grid aspect-[4/3] place-items-center bg-muted"><FileText className="size-6 text-muted-foreground" /></span>}
              <span className="grid gap-px border-t px-2.5 py-1.5 text-[12px]">
                <span className="truncate font-medium">{i.file.name}</span>
                <span className="text-muted-foreground" data-num>{fileSize(i.file.size, locale)}</span>
              </span>
              <Button type="button" variant="secondary" size="icon-xs" onClick={() => remove(i.key)} aria-label={t("remove", { name: i.file.name })}
                className="absolute top-1.5 right-1.5 rounded-full bg-surface/90 shadow-sm backdrop-blur"><X /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
