"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** What the team would get: the last report or idea the demo widget "sent" (mock.ts), shown next to the app. */
interface Sent {
  kind: string; number: number; title: string; body: string;
  context: { url?: string; browser?: string; viewport?: string; appVersion?: string; errors?: { text: string }[]; network?: { method: string; url: string; status: number; failed: boolean }[]; actions?: unknown[] };
  files: { name: string; url: string }[];
}

export function DemoInspector() {
  const t = useTranslations("demo");
  const [sent, setSent] = useState<Sent | null>(null);
  useEffect(() => {
    const on = (e: Event) => setSent((e as CustomEvent<Sent>).detail);
    window.addEventListener("ozvi-demo", on);
    return () => window.removeEventListener("ozvi-demo", on);
  }, []);
  const failed = sent?.context.network?.filter((r) => r.failed) ?? [];
  const row = "grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-t py-2.5 text-[13.5px]";

  return (
    <aside aria-live="polite" className="rounded-2xl border bg-surface p-5 shadow-[0_30px_80px_-40px_rgb(13_12_20/0.35)]">
      <h2 className="text-[17px] font-semibold tracking-tight">{t("inspector.title")}</h2>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{t("inspector.note")}</p>
      {!sent ? (
        <p className="mt-5 rounded-xl border border-dashed p-4 text-[14px] leading-relaxed text-muted-foreground">{t("inspector.empty")}</p>
      ) : (
        <div className="mt-4">
          <p className="flex items-baseline gap-2">
            <span data-num className="text-[20px] font-extrabold tracking-tight">#{sent.number}</span>
            <span className="text-[15px] font-semibold">{sent.title || t("inspector.untitled")}</span>
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">{sent.kind === "idea" ? t("inspector.idea") : t("inspector.bug")}</p>
          {sent.body && <p className="mt-3 text-[14px] leading-relaxed whitespace-pre-wrap">{sent.body}</p>}
          {sent.files.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f.url} src={f.url} alt={t("inspector.shot")} className="mt-4 w-full rounded-lg border" />
          ))}
          {sent.kind !== "idea" && (
            <dl className="mt-4">
              <div className={row}><dt className="text-muted-foreground">{t("inspector.page")}</dt><dd className="truncate font-mono text-[12.5px]">{sent.context.url}</dd></div>
              <div className={row}><dt className="text-muted-foreground">{t("inspector.version")}</dt><dd className="font-mono text-[12.5px]">{sent.context.appVersion || "–"}</dd></div>
              <div className={row}><dt className="text-muted-foreground">{t("inspector.browser")}</dt><dd className="truncate text-[12.5px]">{sent.context.browser} · {sent.context.viewport}</dd></div>
              <div className={row}><dt className="text-muted-foreground">{t("inspector.errors")}</dt><dd className="grid gap-1 font-mono text-[12px]">{sent.context.errors?.length ? sent.context.errors.map((e, i) => <span key={i} className="text-destructive">{e.text}</span>) : <span className="text-muted-foreground">–</span>}</dd></div>
              <div className={row}><dt className="text-muted-foreground">{t("inspector.network")}</dt><dd className="grid gap-1 font-mono text-[12px]">{failed.length ? failed.map((r, i) => <span key={i} className="truncate"><b className="text-destructive">{r.status || "—"}</b> {r.method} {r.url}</span>) : <span className="text-muted-foreground">{t("inspector.noFailed")}</span>}</dd></div>
              <div className={row}><dt className="text-muted-foreground">{t("inspector.actions")}</dt><dd>{sent.context.actions?.length ?? 0}</dd></div>
            </dl>
          )}
        </div>
      )}
    </aside>
  );
}
