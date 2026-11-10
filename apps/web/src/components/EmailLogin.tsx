"use client";

import { MailCheck } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface LoginState { step: "email" | "code"; email?: string; error?: string; info?: string }
type Act = (prev: LoginState, form: FormData) => Promise<LoginState>;

/**
 * Narrow centered composition for sign-in and one-click confirmations (login, links, invites,
 * unsubscribe, OAuth consent). Inherits whatever theme the surrounding layout injected.
 */
export function AuthShell({ title, lede, children, foot, className }: {
  title: React.ReactNode; lede?: React.ReactNode; children?: React.ReactNode; foot?: React.ReactNode; className?: string;
}) {
  return (
    <main id="main" tabIndex={-1} className={cn("oz-frame flex justify-center pt-10 pb-16 sm:pt-16 md:pt-20", className)}>
      <div className="w-full max-w-[420px] min-w-0">
        <h1 className="font-heading text-[26px] leading-tight font-semibold tracking-[-0.035em] text-balance sm:text-[30px]">{title}</h1>
        {lede && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{lede}</p>}
        {children && <div className="mt-6 rounded-xl border bg-surface p-5 sm:p-6">{children}</div>}
        {foot && <div className="mt-5 text-[13px] leading-relaxed text-muted-foreground">{foot}</div>}
      </div>
    </main>
  );
}

/**
 * Two steps on one card: e-mail → 6-digit code (the e-mail also carries a one-click link).
 * Strings come from account.emailLogin in the page's locale (the console's, or the board's on a board).
 */
export function EmailLogin({ request, verify, cta, expired }: { request: Act; verify: Act; cta?: string; expired?: boolean }) {
  const t = useTranslations("account.emailLogin");
  const v = useTranslations("forms.validation");
  const [state, action, pending] = useActionState<LoginState, FormData>(async (prev, f) => {
    if (f.get("restart")) return { step: "email", email: prev.email };
    if (f.get("resend")) {
      const again = new FormData();
      again.set("email", prev.email ?? "");
      return request({ step: "email", email: prev.email }, again);
    }
    return prev.step === "email" ? request(prev, f) : verify(prev, f);
  }, { step: "email", ...(expired && { error: t("expired") }) });

  if (state.step === "email") {
    return (
      <form action={action} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="login-email" className="text-[14px] font-semibold">{t("email")}</Label>
          <Input id="login-email" name="email" type="email" required autoComplete="email" inputMode="email" defaultValue={state.email}
            autoFocus placeholder={t("placeholder")} className="h-11 text-[16px]" aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "login-error" : "login-hint"} />
        </div>
        {state.error && <p id="login-error" className="text-[14px] font-medium text-destructive" role="alert">{state.error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending || undefined}>{pending ? t("sendingCode") : cta ?? t("sendCode")}</Button>
        <p id="login-hint" className="text-[13px] text-muted-foreground">{t("hint")}</p>
      </form>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <div className="flex items-start gap-3 rounded-lg bg-muted px-3.5 py-3" role="status">
        <MailCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <div className="min-w-0 text-[14px]">
          {state.info ?? <>{t("sentTo")}<b className="break-all">{state.email}</b>.</>}
          <div className="text-[13px] text-muted-foreground">{t("validity")}</div>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="login-code" className="text-[14px] font-semibold">{t("codeLabel")}</Label>
        <Input id="login-code" name="code" required autoFocus inputMode="numeric"
          // Six digits typed or pasted: submit right away (the button stays for keyboard users).
          onChange={(e) => { if (!pending && e.currentTarget.value.replace(/\D/g, "").length === 6) e.currentTarget.form?.requestSubmit(); }} autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} data-error={v("code")}
          placeholder="000000" aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? "login-error" : undefined}
          className="h-14 text-center font-mono text-[26px] font-semibold tracking-[0.4em] tabular-nums placeholder:text-line-strong md:text-[26px]" />
      </div>
      {state.error && <p id="login-error" className="text-[14px] font-medium text-destructive" role="alert">{state.error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending || undefined}>{pending ? t("verifying") : t("signIn")}</Button>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-3">
        <Button type="submit" variant="link" size="sm" className="h-auto px-0 text-brand-text" name="restart" value="1" formNoValidate disabled={pending}>{t("changeEmail")}</Button>
        <Button type="submit" variant="link" size="sm" className="h-auto px-0 text-brand-text" name="resend" value="1" formNoValidate disabled={pending}>{t("resend")}</Button>
      </div>
    </form>
  );
}
