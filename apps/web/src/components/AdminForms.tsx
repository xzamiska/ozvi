"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";
import { LOCALE_NAME, LOCALES } from "@/i18n/locales";
import { rotateSecret, saveLanguages, saveMcpLockdown, saveSettings, type AdminState } from "@/lib/admin-actions";
import { Field, hint, noFill, panel, Result, SecretBox } from "./settings";

function SwitchRow({ id, name, defaultChecked, title, text }: { id: string; name: string; defaultChecked: boolean; title: string; text: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="text-[14px] font-semibold">{title}</Label>
        <p className={hint} id={`${id}-hint`}>{text}</p>
      </div>
      <Switch id={id} name={name} defaultChecked={defaultChecked} aria-describedby={`${id}-hint`} className="mt-0.5" />
    </div>
  );
}

export function SettingsForm({ slug, name, loginUrl, origins, ideasPublic, emailLogin, moderateIdeas }: {
  slug: string; name: string; loginUrl: string; origins: string[]; ideasPublic: boolean; emailLogin: boolean; moderateIdeas: boolean;
}) {
  const t = useTranslations("admin.settings");
  const tm = useTranslations("moderation");
  const [state, action, pending] = useActionState((p: AdminState, f: FormData) => saveSettings(slug, p, f), {});
  return (
    <form action={action} className={panel}>
      <Field id="s-name" label={t("project.name")} hint={t("project.nameHint")}>
        <Input id="s-name" name="name" defaultValue={name} required minLength={2} maxLength={60} {...noFill} className="max-w-md" />
      </Field>
      <SwitchRow id="s-public" name="ideasPublic" defaultChecked={ideasPublic}
        title={t("project.publicTitle")} text={t("project.publicText")} />
      <SwitchRow id="s-moderate" name="moderateIdeas" defaultChecked={moderateIdeas}
        title={tm("settingTitle")} text={tm("settingText")} />
      <SwitchRow id="s-email" name="emailLogin" defaultChecked={emailLogin}
        title={t("project.emailTitle")} text={t("project.emailText")} />
      <Field id="s-login" label={t("project.loginUrl")} optional hint={t("project.loginUrlHint")}>
        <Input id="s-login" name="loginUrl" type="url" defaultValue={loginUrl} placeholder="https://app.billiwo.com/feedback-login" {...noFill} />
      </Field>
      <Field id="s-origins" label={t("project.origins")} hint={t("project.originsHint")}>
        <Textarea id="s-origins" name="origins" rows={3} defaultValue={origins.join("\n")} placeholder="https://app.billiwo.com" spellCheck={false} className="font-mono text-[13px]" />
      </Field>
      <div className="grid gap-3">
        <Result error={state.error} ok={state.ok} />
        <div><Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? t("saving") : t("project.save")}</Button></div>
      </div>
    </form>
  );
}

export function LockdownForm({ slug, on }: { slug: string; on: boolean }) {
  const t = useTranslations("admin.integrations");
  const [state, action, pending] = useActionState((p: AdminState, f: FormData) => saveMcpLockdown(slug, p, f), {});
  return (
    <form action={action} className={panel}>
      <SwitchRow id="s-lockdown" name="mcpLockdown" defaultChecked={on} title={t("lockdownTitle")} text={t("lockdownText")} />
      <div className="grid gap-3">
        <Result error={state.error} ok={state.ok} />
        <div><Button type="submit" variant="outline" disabled={pending} aria-busy={pending || undefined}>{t("lockdownSave")}</Button></div>
      </div>
    </form>
  );
}

export function SecretForm({ slug, hasSecret }: { slug: string; hasSecret: boolean }) {
  const t = useTranslations("admin.settings.sso");
  const s = useTranslations("admin.settings");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (p: AdminState, f: FormData) => {
    const r = await rotateSecret(slug, p, f);
    setOpen(false);
    return r;
  }, {});
  return (
    <div className="grid gap-4">
      <p className="text-[14px]">
        {hasSecret
          ? <><span className="font-semibold text-success">{t("on")}</span> <span className="text-muted-foreground">{t("onText")}</span></>
          : <span className="text-muted-foreground">{t("off")}</span>}
      </p>
      {state.secret && (
        <SecretBox title={hasSecret ? t("newActive") : t("on")} secret={state.secret}>
          {t("setA")} <code className="font-mono">OZVI_SSO_SECRET</code>.{hasSecret ? t("oldGone") : t("onlyNow")}
        </SecretBox>
      )}
      {!state.secret && <Result error={state.error} />}
      {hasSecret ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button type="button" variant="outline" className="justify-self-start"><RefreshCw />{t("rotate")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("rotateTitle")}</DialogTitle>
              <DialogDescription>{t("rotateText")}</DialogDescription>
            </DialogHeader>
            <form action={action}>
              <input type="hidden" name="confirm" value="on" />
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">{s("keep")}</Button></DialogClose>
                <Button type="submit" variant="destructive" disabled={pending}>{pending ? t("rotating") : t("rotateConfirm")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : (
        <form action={action}>
          <Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? t("enabling") : t("enable")}</Button>
        </form>
      )}
    </div>
  );
}

/** Board languages: one default (always offered) and the set visitors may get or pick. */
export function LanguagesForm({ slug, defaultLocale, locales, translationMode = "off", aiReady = false }: {
  slug: string; defaultLocale: string; locales: string[];
  /** Post translation (lib/translate.ts): off | on_demand | auto; needs AI (plan with AI / OZVI_AI_PROVIDER). */
  translationMode?: string; aiReady?: boolean;
}) {
  const all = useTranslations("admin");
  const t = useTranslations("admin.languages");
  const [def, setDef] = useState(defaultLocale);
  const [state, action, pending] = useActionState((p: AdminState, f: FormData) => saveLanguages(slug, p, f), {});
  return (
    <form action={action} className={panel}>
      <fieldset className="grid gap-2.5">
        <legend className="mb-1 text-[14px] font-semibold">{t("default")}</legend>
        <p className={hint} id="lang-default-hint">{t("defaultHint")}</p>
        <RadioGroup name="defaultLocale" value={def} onValueChange={setDef} aria-describedby="lang-default-hint" className="flex flex-wrap gap-x-6 gap-y-2.5">
          {LOCALES.map((l) => (
            <div key={l} className="flex items-center gap-2">
              <RadioGroupItem id={`lang-def-${l}`} value={l} />
              <Label htmlFor={`lang-def-${l}`} className="cursor-pointer text-[14px] font-normal" lang={l}>{LOCALE_NAME[l]}</Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
      <fieldset className="grid gap-2.5">
        <legend className="mb-1 text-[14px] font-semibold">{t("enabled")}</legend>
        <p className={hint} id="lang-enabled-hint">{t("enabledHint")}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2.5">
          {LOCALES.map((l) => (
            <div key={l} className="flex items-center gap-2">
              {/* The default is always offered: checked and locked, and sent along so the action sees it. */}
              <Checkbox id={`lang-on-${l}`} name="locales" value={l} key={`${l}-${def === l}`}
                defaultChecked={def === l || locales.includes(l)} disabled={def === l} />
              {def === l && <input type="hidden" name="locales" value={l} />}
              <Label htmlFor={`lang-on-${l}`} className="cursor-pointer text-[14px] font-normal" lang={l}>{LOCALE_NAME[l]}</Label>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-2.5" disabled={!aiReady}>
        <legend className="mb-1 text-[14px] font-semibold">{t("translation")}</legend>
        <p className={hint} id="lang-translation-hint">{aiReady ? t("translationHint") : t("translationNoAi")}</p>
        <RadioGroup name="translationMode" defaultValue={aiReady ? translationMode : "off"} disabled={!aiReady} aria-describedby="lang-translation-hint" className="grid gap-3">
          {(["off", "on_demand", "auto"] as const).map((m) => (
            <div key={m} className="flex items-start gap-2.5">
              <RadioGroupItem id={`lang-tr-${m}`} value={m} className="mt-0.5" aria-describedby={`lang-tr-${m}-hint`} />
              <Label htmlFor={`lang-tr-${m}`} className="grid cursor-pointer gap-0.5 text-[14px] font-normal">
                <span className="font-medium">{t(`mode.${m}`)}</span>
                <span id={`lang-tr-${m}-hint`} className="text-[13px] text-muted-foreground">{t(`mode.${m}Hint`)}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="grid gap-3">
        <Result error={state.error} ok={state.ok} />
        <div><Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? all("settings.saving") : t("save")}</Button></div>
      </div>
    </form>
  );
}
