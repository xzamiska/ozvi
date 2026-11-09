"use client";

import { ChevronLeft, ChevronRight, Download, FileText, Maximize2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLocale, useTranslations } from "next-intl";
import { fileSize } from "@/lib/format";
import { contentRegion, type Region } from "@/lib/image-region";
import { cn } from "@/lib/utils";

export interface GalleryFile { id: string; name: string; mime: string; bytes: number }

/** Attachments: image grid with a keyboard-friendly lightbox, other files as rows. */
/** `narrow`: the gallery shares its row (with the bug's step timeline), so several images get two columns, not three. */
export function Gallery({ slug, files, narrow = false }: { slug: string; files: GalleryFile[]; narrow?: boolean }) {
  const images = files.filter((f) => f.mime.startsWith("image/"));
  const others = files.filter((f) => !f.mime.startsWith("image/"));
  const [index, setIndex] = useState<number | null>(null);
  const locale = useLocale();
  const t = useTranslations("forms.gallery");
  const src = (f: GalleryFile) => `/${slug}/files/${f.id}`;
  const step = useCallback((d: number) => setIndex((i) => (i === null ? i : (i + d + images.length) % images.length)), [images.length]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, step]);

  const current = index === null ? null : images[index];
  const single = images.length === 1;

  return (
    <section aria-label={t("label")} className="grid gap-3">
      {images.length > 0 && (
        <ul className={single ? "grid" : narrow ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2 sm:grid-cols-3"}>
          {images.map((f, i) => (
            <li key={f.id}>
              {/* Never crop what matters: one image keeps its proportions and, when it is mostly empty page
                  (a typical screenshot), zooms to the part with content; several images share a grid, whole. */}
              <button type="button" onClick={() => setIndex(i)} aria-label={t("zoom", { name: f.name })}
                className={cn("group relative grid w-full place-items-center overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  !single && "aspect-[4/3] p-1.5")}>
                {single ? <FocusImage src={src(f)} />
                  : <img src={src(f)} alt="" loading="lazy" decoding="async" className="max-h-full max-w-full rounded-sm object-contain transition-transform duration-300 ease-out-expo group-hover:scale-[1.015]" />}
                <span aria-hidden className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-md border bg-surface/90 text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Maximize2 className="size-4" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul className="grid gap-1.5">
          {others.map((f) => (
            <li key={f.id} className="flex items-center gap-2.5 rounded-lg border bg-surface px-3 py-2 text-[14px]">
              <FileText className="size-4 text-muted-foreground" />
              <a href={src(f)} className="min-w-0 flex-1 truncate font-medium hover:underline">{f.name}</a>
              <span className="text-xs text-muted-foreground" data-num>{fileSize(f.bytes, locale)}</span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={current != null} onOpenChange={(o) => !o && setIndex(null)}>
        <DialogContent showCloseButton={false} className="max-h-[94dvh] w-auto max-w-[min(96vw,1200px)] gap-0 overflow-hidden border-0 bg-black p-0 sm:max-w-[min(96vw,1200px)]">
          {current && (
            <figure className="relative grid">
              <img src={src(current)} alt={current.name} className="max-h-[82dvh] w-auto object-contain" />
              <figcaption className="flex items-center gap-3 bg-black px-4 py-3 text-white">
                <DialogTitle className="min-w-0 flex-1 truncate text-[14px] font-medium text-white">{current.name}</DialogTitle>
                <DialogDescription className="text-xs text-white/60">
                  {fileSize(current.bytes, locale)}{images.length > 1 ? ` · ${t("position", { i: index! + 1, n: images.length })}` : ""}
                </DialogDescription>
                <Button asChild variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white">
                  <a href={src(current)} download={current.name} aria-label={t("download")}><Download /></a>
                </Button>
                <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setIndex(null)} aria-label={t("close")}><X /></Button>
              </figcaption>
              {images.length > 1 && (
                <>
                  <Button variant="secondary" size="icon" className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full opacity-90" onClick={() => step(-1)} aria-label={t("prev")}><ChevronLeft /></Button>
                  <Button variant="secondary" size="icon" className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full opacity-90" onClick={() => step(1)} aria-label={t("next")}><ChevronRight /></Button>
                </>
              )}
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function regionOf(img: HTMLImageElement): Region | null {
  const width = 160;
  const height = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * width));
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx || !img.naturalWidth) return null;
  ctx.drawImage(img, 0, 0, width, height);
  return contentRegion(ctx.getImageData(0, 0, width, height).data, width, height);
}

/** A single image: whole and centred, or zoomed to its content when the rest is empty page. */
function FocusImage({ src }: { src: string }) {
  const [view, setView] = useState<{ r: Region; w: number; h: number } | null | undefined>(undefined);
  const measure = (img: HTMLImageElement) => {
    if (view !== undefined || !img.complete || !img.naturalWidth) return;
    let r: Region | null = null;
    try { r = regionOf(img); } catch { /* unreadable (cross-origin): show it whole */ }
    setView(r ? { r, w: img.naturalWidth, h: img.naturalHeight } : null);
  };
  const motion = "transition-transform duration-300 ease-out-expo group-hover:scale-[1.015]";
  if (!view) {
    // The server-rendered image may finish loading before hydration (no load event then): the ref checks it.
    return <img ref={(el) => { if (el) measure(el); }} src={src} alt="" decoding="async" onLoad={(e) => measure(e.currentTarget)}
      className={cn("h-auto max-h-[min(60dvh,520px)] w-auto max-w-full object-contain", motion)} />;
  }
  const { r } = view;
  return (
    <span className="relative block w-full overflow-hidden" style={{ aspectRatio: `${r.w * view.w} / ${r.h * view.h}` }}>
      <img src={src} alt="" decoding="async" className={cn("absolute max-w-none origin-center", motion)}
        style={{ width: `${100 / r.w}%`, left: `${(-r.x / r.w) * 100}%`, top: `${(-r.y / r.h) * 100}%` }} />
    </span>
  );
}
