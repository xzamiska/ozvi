import { useEffect, useRef, useState } from "preact/hooks";
import type { VerifyCtx } from "./index";
import { getJson, shared } from "./shared";

/**
 * widget-verify.js (ADR-0014), loaded only when the host app gives the widget no token and the project signs
 * people in by e-mail code: the person types their e-mail, then the 6-digit code from it, without leaving the
 * app. What they wrote in the widget stays (the form is only hidden). Rendered with the widget's Preact.
 */

const T: Record<string, { title: string; why: string; again: string; email: string; send: string; sent: (e: string) => string; code: string; verify: string; other: string; back: string; fail: string; wait: string }> = {
  sk: {
    title: "Overte svoj e-mail", why: "Pošleme vám kód, aby sme vedeli, že ste to vy. Na tento e-mail vám dáme vedieť, keď sa vaše hlásenie alebo nápad pohne.", again: "Poslať nový kód",
    email: "E-mail", send: "Poslať kód", sent: (e) => `Poslali sme kód na ${e}. Platí 15 minút.`, code: "Kód z e-mailu",
    verify: "Overiť a pokračovať", other: "Použiť iný e-mail", back: "Späť", fail: "Nepodarilo sa to. Skúste to znova.", wait: "Chvíľku…",
  },
  cs: {
    title: "Ověřte svůj e-mail", why: "Pošleme vám kód, abychom věděli, že jste to vy. Na tento e-mail vám dáme vědět, až se vaše hlášení nebo nápad pohne.", again: "Poslat nový kód",
    email: "E-mail", send: "Poslat kód", sent: (e) => `Poslali jsme kód na ${e}. Platí 15 minut.`, code: "Kód z e-mailu",
    verify: "Ověřit a pokračovat", other: "Použít jiný e-mail", back: "Zpět", fail: "Nepodařilo se to. Zkuste to znovu.", wait: "Chvilku…",
  },
  en: {
    title: "Confirm your e-mail", why: "We'll send you a code to make sure it's you, and e-mail you when your report or idea moves on.", again: "Send a new code",
    email: "E-mail", send: "Send code", sent: (e) => `We sent a code to ${e}. It's valid for 15 minutes.`, code: "Code from the e-mail",
    verify: "Verify and continue", other: "Use a different e-mail", back: "Back", fail: "That didn't work. Please try again.", wait: "One moment…",
  },
  pl: {
    title: "Potwierdź swój e-mail", why: "Wyślemy Ci kod, aby upewnić się, że to Ty, i damy znać na ten adres, gdy Twoje zgłoszenie lub pomysł ruszy dalej.", again: "Wyślij nowy kod",
    email: "E-mail", send: "Wyślij kod", sent: (e) => `Wysłaliśmy kod na ${e}. Jest ważny 15 minut.`, code: "Kod z e-maila",
    verify: "Zweryfikuj i kontynuuj", other: "Użyj innego e-maila", back: "Wstecz", fail: "Nie udało się. Spróbuj ponownie.", wait: "Chwileczkę…",
  },
  hu: {
    title: "Erősítse meg e-mail-címét", why: "Küldünk egy kódot, hogy tudjuk, Ön az, és erre a címre írunk, ha a bejelentése vagy ötlete halad.", again: "Új kód küldése",
    email: "E-mail", send: "Kód küldése", sent: (e) => `Elküldtük a kódot ide: ${e}. 15 percig érvényes.`, code: "Kód az e-mailből",
    verify: "Ellenőrzés és folytatás", other: "Másik e-mail-cím", back: "Vissza", fail: "Nem sikerült. Próbálja újra.", wait: "Egy pillanat…",
  },
  de: {
    title: "E-Mail-Adresse bestätigen", why: "Wir senden Ihnen einen Code, um sicherzugehen, dass Sie es sind, und benachrichtigen Sie an diese Adresse, wenn es mit Ihrer Meldung oder Idee weitergeht.", again: "Neuen Code senden",
    email: "E-Mail", send: "Code senden", sent: (e) => `Wir haben einen Code an ${e} gesendet. Er ist 15 Minuten gültig.`, code: "Code aus der E-Mail",
    verify: "Bestätigen und weiter", other: "Andere E-Mail verwenden", back: "Zurück", fail: "Das hat nicht geklappt. Bitte versuchen Sie es erneut.", wait: "Einen Moment …",
  },
};

const CSS = `.ov-why{font-size:13px;opacity:.8;margin:4px 0 0}.ov h3{margin:0;font-size:15px;font-weight:700}
.ov-links{display:flex;justify-content:space-between;gap:8px;margin-top:10px}
.ov-links button{all:unset;cursor:pointer;font-size:13px;font-weight:600;color:var(--oz-accent,#5A3FE6);padding:4px 2px;border-radius:6px}
.ov-links button:hover{text-decoration:underline}.ov-links button:focus-visible{outline:2px solid var(--oz-accent,#5A3FE6)}`;

function Verify({ ctx }: { ctx: VerifyCtx }) {
  const t = T[ctx.lang] ?? T.en!;
  const url = `${ctx.host}/${ctx.project}/api/widget/login?lang=${ctx.lang}`;
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => field.current?.focus(), 30); }, [step]);

  const post = <R,>(body: unknown) => getJson<R>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  async function submit(e: Event) {
    e.preventDefault();
    if (busy) return;
    const value = field.current?.value.trim() ?? "";
    setBusy(true); setErr("");
    try {
      if (step === "email") {
        await post({ email: value });
        setEmail(value); setStep("code");
      } else {
        const r = await post<{ token: string }>({ email, code: value });
        ctx.done(r.token);
      }
    } catch (x) {
      setErr((x as Error).message || t.fail);
    } finally { setBusy(false); }
  }

  return (
    <form class="ov" onSubmit={submit}>
      <style nonce={shared().nonce}>{CSS}</style>
      <h3>{t.title}</h3>
      {step === "email" ? (
        <>
          <p class="ov-why">{t.why}</p>
          <label for="ov-f">{t.email}</label>
          <input id="ov-f" key="e" ref={field} type="email" required autocomplete="email" maxLength={254} defaultValue={email} />
        </>
      ) : (
        <>
          <p class="ov-why" role="status">{t.sent(email)}</p>
          <label for="ov-f">{t.code}</label>
          {/* Six digits typed or pasted: send at once, as the console's sign-in does. */}
          <input id="ov-f" key="c" ref={field} required inputMode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7}
            onInput={(e) => { if (e.currentTarget.value.replace(/\D/g, "").length === 6) e.currentTarget.form?.requestSubmit(); }} />
        </>
      )}
      {err && <p class="err" role="alert">{err}</p>}
      <button class="btn" disabled={busy}>{busy ? t.wait : step === "email" ? t.send : t.verify}</button>
      <div class="ov-links">
        <button type="button" onClick={ctx.cancel}>{t.back}</button>
        {step === "code" && (
          <span>
            <button type="button" disabled={busy} onClick={() => { setBusy(true); setErr(""); post({ email }).then(() => field.current?.focus(), (x: Error) => setErr(x.message || t.fail)).finally(() => setBusy(false)); }}>{t.again}</button>
            {" · "}
            <button type="button" onClick={() => { setStep("email"); setErr(""); }}>{t.other}</button>
          </span>
        )}
      </div>
    </form>
  );
}

(window as unknown as { __ozviVerify: typeof Verify }).__ozviVerify = Verify;
