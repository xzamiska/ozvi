"use client";

import { Download, RotateCcw, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearFavicon, fetchFavicon, uploadFavicon, type AdminState } from "@/lib/admin-actions";
import { Field, hint, noFill, panel, Result } from "./settings";

/**
 * The board's favicon (Settings → Look): take it from the host app's website, upload one, or go
 * back to the board's letter in its accent colour. The preview is the live /<slug>/favicon.
 */
export function FaviconForm({ slug, site, version, custom }: { slug: string; site: string; version: string; custom: boolean }) {
  const t = useTranslations("admin.favicon");
  // One message line: whatever the last action said.
  const [last, setLast] = useState<AdminState>({});
  const [address, setAddress] = useState(site);
  const report = async (r: Promise<AdminState>) => { const s = await r; setLast(s); return s; };
  const [, fetchAction, fetching] = useActionState((p: AdminState, f: FormData) => report(fetchFavicon(slug, p, f)), {});
  const [, uploadAction, uploading] = useActionState((p: AdminState, f: FormData) => report(uploadFavicon(slug, p, f)), {});
  const [clearing, startClear] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLFormElement>(null);
  const src = `/${slug}/favicon?v=${version}`;

  return (
    <div className={panel}>
      <div className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl border bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" width={32} height={32} className="size-8 object-contain" />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">{t("title")}</p>
          <p className={hint}>{custom ? t("custom") : t("letter")}</p>
        </div>
      </div>

      <form action={fetchAction} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field id="fav-site" label={t("site")} hint={t("siteHint")}>
          <Input id="fav-site" name="site" type="url" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="https://app.vasafirma.sk" spellCheck={false} {...noFill} />
        </Field>
        <Button type="submit" variant="outline" disabled={fetching} className="sm:mb-[22px]"><Download />{fetching ? t("fetching") : t("fetch")}</Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <form ref={upload} action={uploadAction}>
          <input ref={file} type="file" name="icon" accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/gif,image/webp,.ico"
            className="sr-only" tabIndex={-1} aria-hidden onChange={() => upload.current?.requestSubmit()} />
          <Button type="button" variant="outline" disabled={uploading} onClick={() => file.current?.click()}><Upload />{uploading ? t("uploading") : t("upload")}</Button>
        </form>
        {custom && (
          <Button type="button" variant="ghost" disabled={clearing} onClick={() => startClear(async () => { await report(clearFavicon(slug)); })}><RotateCcw />{t("clear")}</Button>
        )}
        <span className={hint}>{t("uploadHint")}</span>
      </div>

      <Result error={last.error} ok={last.ok} />
    </div>
  );
}
