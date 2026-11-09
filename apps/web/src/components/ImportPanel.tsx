"use client";

import { AlertTriangle, CircleAlert, FileArchive, FileUp, KeyRound, Lock, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cannyConnect, cannyStart, fiderLoad, fiderPreview, fiderStart, previewCsv, startCsv, undoRun, type CannyState, type CsvPreviewState, type FiderState } from "@/lib/import-actions";
import type { CsvField } from "@/lib/import/csv-map";
import { routeText } from "@/lib/route";
import { cn } from "@/lib/utils";
import { StatusMark } from "./ozvi/route";
import { ChoiceLabel, ConfirmAction, Result } from "./settings";
import { hint, noFill } from "./settings-base";

const FIELDS: CsvField[] = ["title", "body", "kind", "status", "authorEmail", "authorName", "createdAt", "tags", "voterEmails", "links", "id"];
const NONE = "__none";

/** Admin → Import: generic CSV (with Canny's CSV export recognised), Canny API, Fider (backup.zip or API). */
export function ImportPanel({ slug }: { slug: string }) {
  const t = useTranslations("import");
  return (
    <Tabs defaultValue="csv" className="gap-4">
      <TabsList className="max-w-full overflow-x-auto">
        <TabsTrigger value="csv">{t("tabs.csv")}</TabsTrigger>
        <TabsTrigger value="canny">{t("tabs.canny")}</TabsTrigger>
        <TabsTrigger value="fider">{t("tabs.fider")}</TabsTrigger>
      </TabsList>
      <TabsContent value="csv"><CsvImport slug={slug} /></TabsContent>
      <TabsContent value="canny"><CannyImport slug={slug} /></TabsContent>
      <TabsContent value="fider"><FiderImport slug={slug} /></TabsContent>
    </Tabs>
  );
}

function CsvImport({ slug }: { slug: string }) {
  const t = useTranslations("import");
  const id = useId();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"idea" | "bug">("idea");
  const [state, setState] = useState<CsvPreviewState>({});
  const [pending, start] = useTransition();
  const [starting, startRun] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const form = (f: File, k: string, mapping?: CsvPreviewState["mapping"]) => {
    const fd = new FormData();
    fd.set("file", f); fd.set("kind", k);
    if (mapping) fd.set("mapping", JSON.stringify(mapping));
    return fd;
  };
  const preview = (f: File, k: string, mapping?: CsvPreviewState["mapping"]) =>
    start(async () => setState(await previewCsv(slug, {}, form(f, k, mapping))));

  const setField = (field: CsvField, header: string) => {
    if (!file) return;
    const mapping = { ...state.mapping };
    if (header === NONE) delete mapping[field]; else mapping[field] = header;
    setState((s) => ({ ...s, mapping }));
    preview(file, kind, mapping);
  };
  const run = () => file && state.mapping && startRun(async () => {
    const r = await startCsv(slug, {}, form(file, kind, state.mapping));
    if (r.error) { setState((s) => ({ ...s, error: r.error })); return; }
    toast.success(t("started"));
    setFile(null); setState({});
    if (input.current) input.current.value = "";
    router.refresh();
  });

  const p = state.preview;
  return (
    <div className="grid gap-5 rounded-xl border bg-surface p-5 sm:p-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-file`} className="text-[14px]">{t("csv.file")}</Label>
          <label htmlFor={`${id}-file`} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-wash px-3.5 py-2.5 text-[14px] transition-colors hover:border-line-strong",
            file && "border-solid")}>
            <FileUp className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn("min-w-0 truncate", !file && "text-muted-foreground")}>{file ? file.name : t("csv.choose")}</span>
          </label>
          <input ref={input} id={`${id}-file`} type="file" accept=".csv,text/csv,text/plain" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setState({}); if (f) preview(f, kind); }} />
          <p className={hint}>{t("csv.fileHint")}</p>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[14px]">{t("csv.kind")}</Label>
          <Select value={kind} onValueChange={(v) => { const k = v === "bug" ? "bug" : "idea"; setKind(k); if (file) preview(file, k, state.mapping); }}>
            <SelectTrigger aria-label={t("csv.kind")} className="w-full bg-surface md:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="idea">{t("csv.ideas")}</SelectItem>
              <SelectItem value="bug">{t("csv.bugs")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {state.canny && <p className="rounded-lg bg-brand-soft px-3.5 py-2.5 text-[13.5px]">{t("csv.cannyDetected")}</p>}
      <Result error={state.error} />

      {state.headers && state.mapping && (
        <fieldset className="grid gap-3" aria-busy={pending || undefined}>
          <legend className="mb-1 text-[14px] font-semibold">{t("csv.mapping")}</legend>
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f} className="grid gap-1">
                <Label className="text-[13px] text-muted-foreground">{t(`fields.${f}`)}{f === "title" && <span aria-hidden className="text-destructive"> *</span>}</Label>
                <Select value={state.mapping?.[f] ?? NONE} onValueChange={(v) => setField(f, v)}>
                  <SelectTrigger aria-label={t(`fields.${f}`)} className="w-full bg-surface text-[13.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("csv.notMapped")}</SelectItem>
                    {state.headers!.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      {p && <PreviewView state={state} pending={pending} />}

      {p && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <p className={hint}>{t("csv.safe")}</p>
          <Button type="button" onClick={run} disabled={starting || pending || p.items.create === 0} aria-busy={starting || undefined}>
            {starting ? t("starting") : p.items.create === 0 ? t("csv.nothingNew") : t("csv.start", { n: p.items.create })}
          </Button>
        </div>
      )}
    </div>
  );
}

function PreviewView({ state, pending, count }: { state: CsvPreviewState; pending: boolean; count?: string }) {
  const t = useTranslations("import");
  const tr = useTranslations("route");
  const locale = useLocale();
  const p = state.preview!;
  const stats = [
    { label: t("preview.ideas"), n: p.items.ideas },
    { label: t("preview.bugs"), n: p.items.bugs },
    { label: t("preview.people"), n: p.users.create, sub: p.users.existing ? t("preview.peopleExisting", { n: p.users.existing }) : undefined },
    { label: t("preview.votes"), n: p.votes.create },
    { label: t("preview.comments"), n: p.comments.create },
    { label: t("preview.tags"), n: p.tags.create.length, sub: p.tags.existing ? t("preview.tagsExisting", { n: p.tags.existing }) : undefined },
    ...(p.files?.create ? [{ label: t("preview.files"), n: p.files.create, sub: undefined }] : []),
  ];
  const errors = state.issueCount?.errors ?? 0;
  const warnings = state.issueCount?.warnings ?? 0;
  return (
    <section aria-label={t("preview.title")} className={cn("grid gap-4 transition-opacity", pending && "opacity-60")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold">{t("preview.title")}</h3>
        <p className="text-[13px] text-muted-foreground">{count ?? t("preview.rows", { n: state.rows ?? 0 })}{p.items.skip > 0 && ` · ${t("preview.skipped", { n: p.items.skip })}`}</p>
      </div>
      <dl className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 [&>div]:bg-surface [&>div]:px-4 [&>div]:py-3",
        stats.length % 2 === 1 && "[&>div:last-child]:col-span-2 sm:[&>div:last-child]:col-span-1",
        stats.length % 3 === 1 && "sm:[&>div:last-child]:col-span-3", stats.length % 3 === 2 && "sm:[&>div:last-child]:col-span-2")}>
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-[12.5px] text-muted-foreground">{s.label}</dt>
            <dd className="font-heading text-[19px] font-bold tabular-nums">{s.n.toLocaleString(locale)}</dd>
            {s.sub && <dd className="text-[12px] text-muted-foreground">{s.sub}</dd>}
          </div>
        ))}
      </dl>
      {p.numbers && p.numbers.changed > 0 && (
        <p className="flex gap-2.5 rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[13.5px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />{t("preview.renumbered", { kept: p.numbers.kept, changed: p.numbers.changed })}
        </p>
      )}
      {state.notes?.map((n) => (
        <p key={n.key} className="flex gap-2.5 rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[13.5px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />{t(`notes.${n.key as "cannyCsvNoVoters"}`, { n: n.n ?? 0 })}
        </p>
      ))}
      {p.sample.length > 0 && (
        <div className="grid gap-2">
          <h4 className="text-[13px] font-semibold text-muted-foreground">{t("preview.sample")}</h4>
          <ul className="divide-y rounded-lg border">
            {p.sample.map((s, i) => (
              <li key={i} className="grid grid-cols-[16px_minmax(0,1fr)] gap-3 px-3.5 py-2.5">
                <StatusMark kind={s.kind} status={s.status} className="mt-0.5" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{s.title}</p>
                  <p className="truncate text-[12.5px] text-muted-foreground">
                    {[s.kind === "bug" ? t("preview.bug") : t("preview.idea"), routeText(tr, "label", s.status) + (s.subStatus ? ` (${s.subStatus})` : ""), s.author,
                      s.createdAt ? new Date(s.createdAt).toLocaleDateString(locale) : null, s.tags.length ? s.tags.join(", ") : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(errors > 0 || warnings > 0) && (
        <div className="grid gap-2">
          <h4 className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
            {errors > 0 && <span className="inline-flex items-center gap-1.5 text-destructive"><CircleAlert className="size-3.5" />{t("preview.errors", { n: errors })}</span>}
            {warnings > 0 && <span className="inline-flex items-center gap-1.5 text-muted-foreground"><AlertTriangle className="size-3.5" />{t("preview.warnings", { n: warnings })}</span>}
          </h4>
          <div className="max-h-64 overflow-auto rounded-lg border">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-wash text-[12px] text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">{t("preview.row")}</th><th className="px-3 py-2 font-medium">{t("preview.problem")}</th></tr>
              </thead>
              <tbody className="divide-y">
                {state.issues!.map((i, k) => (
                  <tr key={k}>
                    <td className="px-3 py-2 align-top tabular-nums">{i.row || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={i.level === "error" ? "font-medium text-destructive" : ""}>{t(`issues.${i.key}`)}</span>
                      {i.value && <span className="ml-1.5 [overflow-wrap:anywhere] text-muted-foreground">{t("preview.quoted", { v: i.value })}</span>}
                      <span className="ml-1.5 text-[12px] text-muted-foreground">{i.level === "error" ? t("preview.skipRow") : t("preview.fallback")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function CannyImport({ slug }: { slug: string }) {
  const t = useTranslations("import");
  const id = useId();
  const router = useRouter();
  const [key, setKey] = useState("");
  const [state, setState] = useState<CannyState>({});
  const [kinds, setKinds] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const connect = () => start(async () => {
    const fd = new FormData(); fd.set("apiKey", key);
    const r = await cannyConnect(slug, {}, fd);
    setState(r);
    setKinds(Object.fromEntries((r.boards ?? []).map((b) => [b.id, b.kind])));
  });
  const run = () => start(async () => {
    const fd = new FormData(); fd.set("apiKey", key);
    for (const [b, k] of Object.entries(kinds)) fd.set(`board:${b}`, k);
    const r = await cannyStart(slug, {}, fd);
    if (r.error) { setState((s) => ({ ...s, error: r.error })); return; }
    toast.success(t("started"));
    setKey(""); setState({}); setKinds({});
    router.refresh();
  });
  const chosen = Object.values(kinds).filter((k) => k !== "skip").length;
  return (
    <div className="grid gap-5 rounded-xl border bg-surface p-5 sm:p-6">
      <form className="grid gap-1.5" onSubmit={(e) => { e.preventDefault(); connect(); }}>
        <Label htmlFor={`${id}-key`} className="text-[14px]">{t("canny.key")}</Label>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input id={`${id}-key`} type="password" value={key} onChange={(e) => setKey(e.target.value)} {...noFill} spellCheck={false} className="font-mono" />
          <Button type="submit" variant="outline" disabled={pending || key.trim().length < 10} aria-busy={pending || undefined}><KeyRound />{t("canny.connect")}</Button>
        </div>
        <p className={hint}>{t("canny.keyHint")}</p>
      </form>
      <Result error={state.error} />
      {state.boards && (
        <div className="grid gap-3">
          <h3 className="text-[14px] font-semibold">{t("canny.boards")}</h3>
          <ul className="divide-y rounded-lg border">
            {state.boards.map((b) => (
              <li key={b.id} className="grid gap-2 px-3.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{b.name}</p>
                  <p className="text-[12.5px] text-muted-foreground">{t("canny.posts", { n: b.posts })}</p>
                </div>
                <Select value={kinds[b.id] ?? "idea"} onValueChange={(v) => setKinds((k) => ({ ...k, [b.id]: v }))}>
                  <SelectTrigger aria-label={t("canny.destination", { board: b.name })} className="w-full bg-surface text-[13.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="idea">{t("canny.toIdeas")}</SelectItem>
                    <SelectItem value="bug">{t("canny.toBugs")}</SelectItem>
                    <SelectItem value="skip">{t("canny.skip")}</SelectItem>
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
          <p className={hint}>{t("canny.mappingHint")}</p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <p className={hint}>{t("csv.safe")}</p>
            <Button type="button" onClick={run} disabled={pending || chosen === 0} aria-busy={pending || undefined}>{pending ? t("starting") : t("canny.start", { n: chosen })}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const NO = "__none";

function FiderImport({ slug }: { slug: string }) {
  const t = useTranslations("import");
  const id = useId();
  const router = useRouter();
  const [mode, setMode] = useState<"backup" | "api">("backup");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [state, setState] = useState<FiderState>({});
  const [loading, load] = useTransition();
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const reset = () => { setState({}); setFile(null); if (input.current) input.current.value = ""; };
  const read = (f?: File | null) => load(async () => {
    const fd = new FormData();
    fd.set("mode", mode);
    if (mode === "backup") { if (!f) return; fd.set("file", f); } else { fd.set("url", url); fd.set("apiKey", key); }
    setState(await fiderLoad(slug, {}, fd));
  });
  const optionsForm = (o: FiderState["options"]) => {
    const fd = new FormData();
    fd.set("token", state.token ?? "");
    fd.set("bugTag", o?.bugTag ?? ""); fd.set("provider", o?.provider ?? "");
    return fd;
  };
  const setOption = (k: "bugTag" | "provider", v: string) => {
    const o = { bugTag: state.options?.bugTag ?? null, provider: state.options?.provider ?? null, [k]: v === NO ? null : v };
    setState((s) => ({ ...s, options: o }));
    load(async () => {
      const r = await fiderPreview(slug, {}, optionsForm(o));
      setState((s) => (r.error ? { ...s, error: r.error } : r));
    });
  };
  const run = () => start(async () => {
    const fd = optionsForm(state.options);
    if (state.mode === "api") fd.set("apiKey", key);
    const r = await fiderStart(slug, {}, fd);
    if (r.error) { setState((s) => ({ ...s, error: r.error })); return; }
    toast.success(t("started"));
    reset(); setKey("");
    router.refresh();
  });

  const p = state.preview;
  const sum = state.summary;
  return (
    <div className="grid gap-5 rounded-xl border bg-surface p-5 sm:p-6">
      <p className="text-[14px]">{t("fider.text")}</p>
      <fieldset className="grid gap-2.5">
        <legend className="mb-2 text-[14px] font-semibold">{t("fider.source")}</legend>
        <RadioGroup value={mode} onValueChange={(v) => { setMode(v === "api" ? "api" : "backup"); reset(); }} className="gap-2.5">
          {(["backup", "api"] as const).map((m) => (
            <div key={m} className="grid grid-cols-[16px_1fr] items-start gap-2.5">
              <RadioGroupItem id={`${id}-${m}`} value={m} className="mt-0.5" />
              <ChoiceLabel htmlFor={`${id}-${m}`} title={t(`fider.${m}Title`)} text={t(`fider.${m}Text`)} />
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      {mode === "backup" ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-zip`} className="text-[14px]">{t("fider.file")}</Label>
          <label htmlFor={`${id}-zip`} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-wash px-3.5 py-2.5 text-[14px] transition-colors hover:border-line-strong",
            file && "border-solid")}>
            <FileArchive className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn("min-w-0 truncate", !file && "text-muted-foreground")}>{file ? file.name : t("fider.choose")}</span>
          </label>
          <input ref={input} id={`${id}-zip`} type="file" accept=".zip,application/zip" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setState({}); if (f) read(f); }} />
          <p className={hint}>{t("fider.fileHint")}</p>
        </div>
      ) : (
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); read(); }}>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-url`} className="text-[14px]">{t("fider.url")}</Label>
            <Input id={`${id}-url`} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://feedback.example.com" {...noFill} spellCheck={false} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-key`} className="text-[14px]">{t("fider.key")}</Label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input id={`${id}-key`} type="password" value={key} onChange={(e) => setKey(e.target.value)} {...noFill} spellCheck={false} className="font-mono" aria-describedby={`${id}-key-hint`} />
              <Button type="submit" variant="outline" disabled={loading || key.trim().length < 8 || !/^https?:\/\/./.test(url.trim())} aria-busy={loading || undefined}><KeyRound />{t("fider.connect")}</Button>
            </div>
            <p id={`${id}-key-hint`} className={hint}>{t("fider.keyHint")}</p>
          </div>
        </form>
      )}

      <div role="status" aria-live="polite" className={cn(!loading && "sr-only")}>
        {loading && !p && <p className="text-[13.5px] text-muted-foreground">{t(mode === "api" ? "fider.loadingApi" : "fider.loadingBackup")}</p>}
      </div>
      <Result error={state.error} />

      {sum && p && (
        <>
          <div className="grid gap-4 border-t pt-5">
            <h3 className="text-[14px] font-semibold">{sum.tenant ? t("fider.found", { name: sum.tenant, n: sum.posts }) : t("fider.foundNoName", { n: sum.posts })}</h3>
            <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label className="text-[13px] text-muted-foreground">{t("fider.bugTag")}</Label>
                <Select value={state.options?.bugTag ?? NO} onValueChange={(v) => setOption("bugTag", v)}>
                  <SelectTrigger aria-label={t("fider.bugTag")} className="w-full bg-surface text-[13.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO}>{t("fider.noBugTag")}</SelectItem>
                    {sum.tags.map((g) => <SelectItem key={g.slug} value={g.slug}>{t("fider.tagOption", { name: g.name, n: g.posts })}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className={hint}>{t("fider.bugTagHint")}</p>
              </div>
              <div className="grid content-start gap-1.5">
                <Label className="text-[13px] text-muted-foreground">{t("fider.provider")}</Label>
                <Select value={state.options?.provider ?? NO} onValueChange={(v) => setOption("provider", v)}>
                  <SelectTrigger aria-label={t("fider.provider")} className="w-full bg-surface text-[13.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO}>{t("fider.noProvider")}</SelectItem>
                    {sum.providers.map((g) => <SelectItem key={g.name} value={g.name}>{t("fider.providerOption", { name: g.name, n: g.users })}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className={hint}>{sum.providers.length ? t("fider.providerHint") : t("fider.providerNone")}</p>
              </div>
            </div>
            {state.people && (state.people.app + state.people.email + state.people.other) > 0 && (
              <p className="text-[13.5px]">{t("fider.people", state.people)}</p>
            )}
            {sum.tags.filter((g) => g.slug !== state.options?.bugTag).length > 0 && (
              <div className="grid gap-2">
                <h4 className="text-[13px] font-semibold text-muted-foreground">{t("fider.tags")}</h4>
                <ul className="flex flex-wrap gap-1.5">
                  {sum.tags.filter((g) => g.slug !== state.options?.bugTag).map((g) => (
                    <li key={g.slug} className="inline-flex items-center gap-1.5 rounded-md border bg-wash px-2 py-1 text-[12.5px]">
                      <span className="font-medium">{g.name}</span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground">{!g.public && <Lock className="size-3" aria-hidden />}{g.public ? t("fider.public") : t("fider.teamOnly")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <PreviewView state={{ preview: p }} pending={loading} count={t("fider.posts", { n: sum.posts })} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <p className={hint}>{t("csv.safe")}</p>
            <Button type="button" onClick={run} disabled={pending || loading || p.items.create === 0} aria-busy={pending || undefined}>
              {pending ? t("starting") : p.items.create === 0 ? t("csv.nothingNew") : t("csv.start", { n: p.items.create })}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export interface RunView {
  id: string; source: string; label: string | null; status: string; total: number; done: number; error: string | null;
  report: Record<string, unknown>; createdAt: string; by: string | null;
}

/** Import history with live progress (refreshes while something runs) and undo. */
export function ImportRuns({ slug, runs }: { slug: string; runs: RunView[] }) {
  const t = useTranslations("import");
  const locale = useLocale();
  const router = useRouter();
  const live = runs.some((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!live) return;
    const h = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(h);
  }, [live, router]);
  if (!runs.length) return null;
  return (
    <ul className="divide-y rounded-xl border bg-surface">
      {runs.map((r) => {
        const rep = r.report as { phase?: string; fetched?: number; items?: number; votes?: number; comments?: number; users?: number; skipped?: { items?: number } };
        const pct = r.total ? Math.min(100, Math.round((r.done / r.total) * 100)) : 0;
        const running = r.status === "queued" || r.status === "running";
        return (
          <li key={r.id} className="grid gap-2 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="grid min-w-0 gap-1">
              <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold">
                <span className="truncate">{r.label ?? r.source}</span>
                <Badge variant={r.status === "failed" ? "destructive" : "outline"}>{t(`status.${r.status as "queued"}`)}</Badge>
              </p>
              <p className="text-[13px] text-muted-foreground">
                {[t(`source.${r.source === "canny" || r.source === "fider" ? r.source : "csv"}`), r.by, new Date(r.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })].filter(Boolean).join(" · ")}
              </p>
              {running && (
                <div className="grid gap-1" role="status" aria-live="polite">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className={cn("h-full rounded-full bg-brand transition-[width]", rep.phase === "fetch" && "w-1/4 animate-pulse")} style={rep.phase === "fetch" ? undefined : { width: `${pct}%` }} />
                  </div>
                  <p className="text-[12.5px] text-muted-foreground tabular-nums">
                    {rep.phase === "fetch" ? t(r.source === "fider" ? "progress.fetchFider" : "progress.fetch", { n: rep.fetched ?? 0 }) : r.status === "queued" ? t("progress.queued") : t("progress.write", { done: r.done, total: r.total })}
                  </p>
                </div>
              )}
              {r.status === "done" && (
                <p className="text-[13px]">{t("summary", { items: rep.items ?? 0, votes: rep.votes ?? 0, comments: rep.comments ?? 0, users: rep.users ?? 0 })}
                  {(rep.skipped?.items ?? 0) > 0 && <span className="text-muted-foreground"> · {t("preview.skipped", { n: rep.skipped!.items! })}</span>}</p>
              )}
              {r.status === "failed" && <p className="text-[13px] text-destructive">{t(`runErrors.${(r.error === "restart" && r.source === "fider" ? "fiderRestart" : r.error ?? "failed") as "failed"}`)}</p>}
            </div>
            {(r.status === "done" || r.status === "failed") && (
              <ConfirmAction
                run={async () => {
                  const res = await undoRun(slug, r.id, {}, new FormData());
                  if (res.error) toast.error(res.error); else toast.success(res.ok);
                  router.refresh();
                }}
                trigger={<><Undo2 />{t("undo")}</>} title={t("undoTitle")} text={t("undoText")} confirm={t("undoConfirm")} pending={t("undoing")} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
