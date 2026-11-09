import { parseTheme, presets } from "@ozvi/theme";
import { describe, expect, it } from "vitest";
import { recipientLocale } from "@/i18n/board";
import { LOCALES } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { statusMails } from "./notify";
import { renderMail } from "./render";

const theme = parseTheme(presets.ozvi);
const item = { number: 7, title: "Export do CSV", status: "fixed", fixedInVersion: "2.4", kind: "bug" } as never;
const idea = { number: 8, title: "Tmavý režim", status: "in_progress", kind: "idea" } as never;

describe("e-mails in the recipient's language", () => {
  const expected = {
    sk: { subject: "Opravené: Export do CSV", cta: "Potvrdiť opravu", foot: "Odhlásiť sa z e-mailov", idea: "Rozpracované" },
    cs: { subject: "Opraveno: Export do CSV", cta: "Potvrdit opravu", foot: "Odhlásit se z e-mailů", idea: "Rozpracováno" },
    en: { subject: "Fixed: Export do CSV", cta: "Confirm the fix", foot: "Unsubscribe from e-mails", idea: "In progress" },
    pl: { subject: "Naprawione: Export do CSV", cta: "Potwierdź poprawkę", foot: "Wypisz się z e-maili", idea: "W realizacji" },
    hu: { subject: "Javítva: Export do CSV", cta: "Javítás megerősítése", foot: "Leiratkozás az e-mailekről", idea: "Folyamatban" },
    de: { subject: "Behoben: Export do CSV", cta: "Korrektur bestätigen", foot: "E-Mails abbestellen", idea: "In Arbeit" },
  } as const;
  for (const locale of LOCALES) {
    it(`renders the bug-fixed mail in ${locale}`, () => {
      const m = renderMail(statusMails.bugReporter(translator(locale, "email"), locale, item, "https://x/i/7"), theme, "Billiwo", "https://x/unsub", locale);
      expect(m.subject).toBe(expected[locale].subject);
      expect(m.html).toContain(`<html lang="${locale}">`);
      expect(m.html).toContain(expected[locale].cta);
      expect(m.text).toContain(`${expected[locale].foot}: https://x/unsub`);
      const s = statusMails.idea(translator(locale, "email"), locale, idea, "https://x/i/8");
      expect(s.heading).toContain(expected[locale].idea);
    });
  }

  it("pluralises digests per language", () => {
    expect(translator("sk", "email")("digestSubject", { project: "B", n: 3 })).toBe("B: 3 novinky k vašej spätnej väzbe");
    expect(translator("cs", "email")("digestSubject", { project: "B", n: 5 })).toBe("B: 5 novinek k vaší zpětné vazbě");
    expect(translator("en", "email")("digestSubject", { project: "B", n: 1 })).toBe("B: 1 update on your feedback");
    expect(translator("sk", "email")("teamDigestSummary", { ideas: 1, bugs: 2, open: 5 })).toBe("1 nový nápad, 2 nové chyby, 5 otvorených chýb.");
    expect(translator("en", "email")("teamDigestSummary", { ideas: 1, bugs: 2, open: 1 })).toBe("1 new idea, 2 new bugs, 1 open bug.");
  });

  it("quotes titles per language and picks the version / no-version text", () => {
    const fixed = { ...(item as object), fixedInVersion: null } as never;
    expect(statusMails.bugReporter(translator("sk", "email"), "sk", item, "u").paragraphs[0]).toBe("„Export do CSV“ je opravené vo verzii 2.4.");
    expect(statusMails.bugReporter(translator("sk", "email"), "sk", item, "u").summary).toBe("Vaše hlásenie „Export do CSV“ je teraz: Opravené (v2.4).");
    expect(statusMails.bugReporter(translator("cs", "email"), "cs", fixed, "u").paragraphs[0]).toBe("„Export do CSV“ je opraveno.");
    expect(statusMails.bugReporter(translator("en", "email"), "en", fixed, "u").summary).toBe("Your report “Export do CSV” is now: Fixed.");
    expect(statusMails.bugFollower(translator("en", "email"), "en", item, "u").paragraphs[0]).toBe("“Export do CSV” · fixed in version 2.4");
    expect(statusMails.idea(translator("en", "email"), "en", idea, "u").summary).toBe("The idea you follow, “Tmavý režim”, is now: In progress.");
  });

  it("falls back to the board default when the user has no (or a disabled) locale", () => {
    expect(recipientLocale({ defaultLocale: "cs", locales: ["cs", "sk"] }, null)).toBe("cs");
    expect(recipientLocale({ defaultLocale: "cs", locales: ["cs", "sk"] }, "en")).toBe("cs");
  });
});

describe("plural forms of the new languages", () => {
  it("Polish uses one / few / many", () => {
    const t = translator("pl", "email");
    const [one, few, many] = [1, 3, 5].map((n) => t("digestSubject", { project: "B", n }));
    expect(new Set([one, few, many]).size).toBe(3);
    expect(t("digestSubject", { project: "B", n: 22 })).toBe(few!.replace("3", "22"));
    expect(t("digestSubject", { project: "B", n: 12 })).toBe(many!.replace("5", "12"));
  });
  it("Hungarian and German pluralise with one / other", () => {
    for (const l of ["hu", "de"] as const) {
      const t = translator(l, "email");
      expect(t("digestSubject", { project: "B", n: 1 })).toContain("1");
      expect(t("digestSubject", { project: "B", n: 7 })).toContain("7");
    }
  });
});
