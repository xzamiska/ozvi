import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { SEEN_PREFIX, seenKey } from "../../../../packages/widget/src/seen";
import { flowCookieName } from "./oidc";
import { buildKit, DEFAULT_CAPTURE, kitHtml, kitMarkdown, type KitConfig, type KitT } from "./privacy-kit";
import { aiRecipient, browserStorage, isPrivateHost, kitConfig, type KitFacts } from "./privacy-kit-config";
import { cookieName, MAX_AGE } from "./session-core";
import { CSV_SEP_KEY, WIDGET_SEEN_PREFIX } from "./storage-keys";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

const T = (l: Locale) => translator(l, "privacyKit") as unknown as KitT;
const text = (cfg: KitConfig, l: Locale = "en") => kitMarkdown(buildKit(cfg, T(l), l));

const facts = (over: Partial<KitFacts["project"]> = {}): KitFacts => ({
  project: {
    slug: "billiwo", name: "Billiwo", ssoSecretEnc: "x", emailLogin: false, oidcIssuer: null, translationMode: "off",
    retentionCaptureDays: 180, retentionClosedFilesDays: null, retentionContactsMonths: null, ...over,
  },
  origin: "https://feedback.billiwo.com",
  aiOn: false,
  integrations: { github: false, linear: false, jira: false, hooks: [] },
  operator: "[obchodné meno prevádzkovateľa]",
  publicUrl: "https://ozvi.io",
});
const cloud = { OZVI_MODE: "cloud" };
const self = { OZVI_MODE: "self", SMTP_URL: "smtp://u:p@smtp.postmarkapp.com:587" };

describe("privacy kit generator", () => {
  it("builds all six sections in every locale, without raw keys", () => {
    for (const l of LOCALES) {
      const kit = buildKit(kitConfig(facts(), cloud), T(l), l);
      expect(kit.sections.map((s) => s.id)).toEqual(["purpose", "data", "recipients", "retention", "rights", "storage"]);
      const md = kitMarkdown(kit);
      expect(md).not.toMatch(/privacyKit\.|\{[a-z]+\}/);
      expect(md).toContain("https://feedback.billiwo.com/billiwo/me");
    }
  });

  it("AI off: no AI provider or AI anywhere", () => {
    const md = text(kitConfig(facts(), cloud));
    expect(md).not.toMatch(/Anthropic|Scaleway|artificial intelligence|AI features/);
  });

  it("AI on in cloud: Scaleway (EU) with the features; translations only when switched on", () => {
    const on = text(kitConfig({ ...facts(), aiOn: true }, cloud));
    expect(on).toContain("Scaleway SAS");
    expect(on).not.toContain("Anthropic");
    expect(on).toContain("drafts of release notes");
    expect(on).not.toContain("machine translation");
    expect(text(kitConfig({ ...facts({ translationMode: "auto" }), aiOn: true }, cloud))).toContain("machine translation");
  });

  it("cloud: Ozvi is the processor, Resend sends e-mail, the sub-processor list is linked", () => {
    const md = text(kitConfig(facts(), cloud));
    expect(md).toContain("as our processor");
    expect(md).toContain("Resend, Inc.");
    expect(md).toContain("https://ozvi.io/subprocessors");
    expect(md).toContain("[provider of the Ozvi service");
  });

  it("self-host: no Resend, no Ozvi as processor, their own SMTP host and hosting placeholder", () => {
    const md = text(kitConfig(facts(), self));
    expect(md).not.toMatch(/Resend|as our processor|subprocessors|Hetzner/);
    expect(md).toContain("smtp.postmarkapp.com");
    expect(md).toContain("[hosting provider, country]");
  });

  it("self-host AI: provider from the AI layer; a model on the operator's network is no third party", () => {
    expect(aiRecipient("cloud", "api.mistral.ai")).toEqual({ kind: "anthropic" });
    expect(aiRecipient("self", "Anthropic")).toEqual({ kind: "anthropic" });
    expect(aiRecipient("self", "api.mistral.ai")).toEqual({ kind: "remote", host: "api.mistral.ai" });
    expect(aiRecipient("self", "ollama:11434")).toEqual({ kind: "local" });
    expect(aiRecipient("self", "192.168.1.20:8000")).toEqual({ kind: "local" });
    expect(aiRecipient("self", null)).toEqual({ kind: "remote", host: null });
    for (const h of ["localhost", "10.0.0.5", "172.20.1.1", "vllm", "gpu.lan"]) expect(isPrivateHost(h)).toBe(true);
    for (const h of ["api.openai.com", "8.8.8.8", "172.32.0.1"]) expect(isPrivateHost(h)).toBe(false);

    const remote = text(kitConfig({ ...facts(), aiOn: true }, self, () => ({ kind: "remote", host: "api.mistral.ai" })));
    expect(remote).toContain("api.mistral.ai");
    expect(remote).not.toContain("Anthropic");
    const local = text(kitConfig({ ...facts(), aiOn: true }, self, () => ({ kind: "local" })));
    expect(local).toContain("on our own server");
    expect(local).not.toContain("Anthropic");
  });

  it("sign-in methods, integrations and retention follow the configuration", () => {
    const md = text(kitConfig({
      ...facts({ ssoSecretEnc: null, emailLogin: true, oidcIssuer: "https://id.billiwo.com/realms/x", retentionCaptureDays: 30, retentionContactsMonths: 12 }),
      integrations: { github: true, linear: false, jira: true, hooks: [{ format: "slack", bugs: false }, { format: "json", bugs: true }] },
    }, cloud));
    expect(md).toContain("one-time code");
    expect(md).toContain("id.billiwo.com");
    expect(md).not.toContain("from your Billiwo account");
    expect(md).toContain("GitHub (GitHub, Inc.)");
    expect(md).toContain("Jira Cloud");
    expect(md).not.toContain("Linear:");
    expect(md).toMatch(/Slack: notifications/);
    expect(md).toContain("including bug reports");
    expect(md).toContain("30 days after");
    expect(md).toContain("12 months");
    expect(md).toContain("`ozvi_oidc_billiwo`");
    expect(text(kitConfig(facts(), cloud))).not.toContain("ozvi_oidc_");
  });

  it("captures the host switched off disappear from the text", () => {
    const cfg = kitConfig(facts(), cloud);
    expect(cfg.capture).toEqual(DEFAULT_CAPTURE);
    const md = text({ ...cfg, capture: { screenshot: false, console: false, network: false, steps: false, links: false } });
    expect(md).not.toMatch(/screenshot of the page|request log and steps/);
  });

  it("HTML escapes text and links URLs", () => {
    const html = kitHtml(buildKit(kitConfig({ ...facts(), project: { ...facts().project, name: "A<b>&" } }, cloud), T("en"), "en"));
    expect(html).toContain("A&lt;b&gt;&amp;");
    expect(html).not.toContain("A<b>");
    expect(html).toContain('<a href="https://ozvi.io/subprocessors">');
    expect(html).toContain("<code>ozvi_billiwo</code>");
  });
});

/* The storage table must match what the code really stores; these scans fail when a new key appears. */

const here = path.dirname(fileURLToPath(import.meta.url));
const webSrc = path.resolve(here, "..");
const widgetSrc = path.resolve(here, "../../../../packages/widget/src");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("privacy kit storage table", () => {
  const table = browserStorage("billiwo", "https://ozvi.io", true);

  it("lists the widget key the widget actually writes", () => {
    expect(SEEN_PREFIX).toBe(WIDGET_SEEN_PREFIX);
    expect(seenKey("https://ozvi.io", "billiwo", "u1").startsWith(table[0]!.name.split("<")[0]!)).toBe(true);
    // The widget touches browser storage only through seen.ts (readSeen/writeSeen); no cookies, no sessionStorage.
    const users = files(widgetSrc).filter((f) => /localStorage|sessionStorage|document\.cookie|indexedDB/.test(readFileSync(f, "utf8")));
    expect(users.map((f) => path.basename(f)).sort()).toEqual(["embeds.tsx", "seen.ts"]);
    for (const f of files(widgetSrc)) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/sessionStorage|document\.cookie|indexedDB/);
      if (path.basename(f) !== "seen.ts") expect(src, f).not.toMatch(/\.setItem\(/);
    }
  });

  it("lists every board cookie and localStorage key the app sets", () => {
    const names = table.map((s) => s.name);
    expect(names).toContain(cookieName("billiwo"));
    expect(names).toContain(flowCookieName("billiwo"));
    expect(names).toContain(LOCALE_COOKIE);
    expect(names).toContain(CSV_SEP_KEY);
    expect(table.find((s) => s.name === cookieName("billiwo"))!.maxAge).toBe(MAX_AGE);

    // Every cookie write goes through a name we know; the console's ozvi_app is for Ozvi customers, not their users.
    const KNOWN_COOKIES = /sessionCookie\(|cookieName\(|flowCookieName\(|LOCALE_COOKIE|appCookie\(|APP_COOKIE/;
    const KNOWN_STORAGE = new Set(["CSV_SEP_KEY"]);
    for (const f of files(webSrc)) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/cookies(?:\(\)\))?\.set\(([^\n]*\n?[^\n]*)/g)) expect(m[1], `${f}: ${m[0]}`).toMatch(KNOWN_COOKIES);
      expect(src, f).not.toMatch(/sessionStorage|document\.cookie|indexedDB/);
      if (/localStorage\.setItem/.test(src)) {
        const key = /const KEY = (\w+);/.exec(src)?.[1];
        expect(key && KNOWN_STORAGE.has(key), `${f} writes localStorage with an unlisted key`).toBe(true);
      }
    }
  });
});
