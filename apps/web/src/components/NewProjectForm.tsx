"use client";

import { Check } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { createProject, type NewProjectState } from "@/lib/app-actions";

const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 41);
const labelCls = "text-[14px] font-semibold";

export function NewProjectForm({ workspaces, swatches, base, initial }: {
  workspaces: { id: string; name: string }[];
  initial?: string;
  swatches: { id: string; name: string; accent: string; canvas: string; ink: string }[];
  base: string;
}) {
  const [state, action, pending] = useActionState<NewProjectState, FormData>(createProject, {});
  const t = useTranslations("account.newProject");
  const v = useTranslations("forms.validation");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const shown = touched ? slug : slugify(name);
  const prefix = base ? `${base}/` : "/";
  useEffect(() => {
    if (state.created) window.location.assign(`/app?created=${encodeURIComponent(state.created)}`);
  }, [state.created]);

  return (
    <form action={action} className="grid gap-7 rounded-xl border bg-surface p-5 sm:p-7">
      <div className="grid gap-2">
        <Label htmlFor="np-name" className={labelCls}>{t("appName")}</Label>
        <Input id="np-name" name="name" required minLength={2} maxLength={60} autoFocus value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t("appPlaceholder")} className="h-11 text-[16px]" autoComplete="off" />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="np-slug" className={labelCls}>{t("address")}</Label>
        <div data-field-control className="flex items-stretch overflow-hidden rounded-md border border-input shadow-xs has-[[aria-invalid=true]]:border-destructive focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <span id="np-prefix" className="hidden shrink-0 items-center border-r bg-wash px-3 font-mono text-[13px] whitespace-nowrap text-muted-foreground sm:flex">
            {prefix}
          </span>
          <input id="np-slug" name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,40}" data-error={v("slug")} value={shown} spellCheck={false} autoComplete="off"
            aria-describedby="np-prefix np-slug-hint"
            onChange={(e) => { setTouched(true); setSlug(slugify(e.target.value)); }}
            className="h-11 min-w-0 flex-1 bg-transparent px-3 font-mono text-[15px] outline-none" />
        </div>
        <p id="np-slug-hint" className="text-[13px] text-muted-foreground">{t("slugHint")} <span className="break-all sm:hidden">{t("boardAt")}<span className="font-mono text-foreground">{prefix}{shown || "…"}</span>.</span></p>
      </div>

      {workspaces.length > 1 && (
        <div className="grid gap-2">
          <Label htmlFor="np-ws" className={labelCls}>{t("workspace")}</Label>
          <Select name="workspace" defaultValue={workspaces.some((w) => w.id === initial) ? initial : workspaces[0]!.id}>
            <SelectTrigger id="np-ws" className="h-11! w-full sm:max-w-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{workspaces.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {workspaces.length === 1 && <input type="hidden" name="workspace" value={workspaces[0]!.id} />}

      <fieldset className="grid gap-3">
        <legend className={`${labelCls} mb-2`}>{t("look")}</legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {swatches.map((s, i) => (
            <label key={s.id}
              className="group relative grid cursor-pointer gap-2 rounded-lg border bg-surface p-2 transition-colors hover:border-line-strong has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50">
              <input type="radio" name="preset" value={s.id} defaultChecked={i === 0} className="peer sr-only" />
              <span aria-hidden className="grid h-14 grid-cols-[1fr_auto] items-end gap-2 rounded-md border p-2" style={{ background: s.canvas, borderColor: `color-mix(in oklab, ${s.ink} 12%, ${s.canvas})` }}>
                <span className="grid gap-1">
                  <span className="block h-1.5 w-3/4 rounded-full" style={{ background: s.ink }} />
                  <span className="block h-1.5 w-1/2 rounded-full opacity-40" style={{ background: s.ink }} />
                </span>
                <span className="block h-4 w-7 rounded-sm" style={{ background: s.accent }} />
              </span>
              <span className="flex items-center justify-between gap-2 px-0.5 text-[13.5px] font-medium">
                {s.name}
                <Check className="size-4 text-primary opacity-0 group-has-[:checked]:opacity-100" aria-hidden />
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && <p className="text-[14px] font-medium text-destructive" role="alert">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Button type="submit" size="lg" disabled={pending || !!state.created} aria-busy={pending || undefined}>
          {pending || state.created ? t("creating") : t("create")}
        </Button>
      </div>
    </form>
  );
}
