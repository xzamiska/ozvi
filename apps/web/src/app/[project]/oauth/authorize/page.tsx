import { AlertTriangle, Globe } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/EmailLogin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { clientIp } from "@/lib/client-ip";
import { requestOrigin } from "@/lib/email/url";
import { findClient, maxScope } from "@/lib/oauth";
import { decideOAuth } from "@/lib/oauth-actions";
import { CimdError, checkClientIdUrl, isCimdClientId, loopbackOnly, resolveClientMetadata } from "@/lib/oauth-cimd";
import { resourceMatches } from "@/lib/oauth-uri";
import { getCtx, loginHref } from "@/lib/project";
import { allow } from "@/lib/ratelimit";
import { getTranslations } from "next-intl/server";

type SP = Record<string, string | undefined>;

const SCOPES = ["read", "write", "triage"] as const;

/**
 * OAuth consent: an AI assistant asks to act as the signed-in person on this board.
 * The client is either a Client ID Metadata Document URL (fetched only once the person is signed
 * in, so anonymous links can't make us fetch) or a legacy dynamically registered id.
 */
export default async function Authorize({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<SP> }) {
  const { project: slug } = await params;
  const sp = await searchParams;
  const { project, user, locale } = await getCtx(slug);
  const t = await getTranslations({ locale, namespace: "admin.oauth" });
  const Err = ({ msg, detail }: { msg: string; detail?: string }) => (
    <AuthShell title={t("cannot")} lede={msg}>{detail && <p className="font-mono text-[12.5px] leading-relaxed break-words text-muted-foreground">{detail}</p>}</AuthShell>
  );

  const clientId = sp.client_id ?? "";
  const cimd = isCimdClientId(clientId);
  const legacy = cimd ? undefined : clientId ? await findClient(project, clientId) : undefined;
  if (cimd) {
    const bad = checkClientIdUrl(clientId);
    if (bad) return <Err msg={t("cimdFailed")} detail={bad} />;
  } else if (!legacy) return <Err msg={t("unknownClient")} />;
  if (!sp.redirect_uri || (legacy && !legacy.redirectUris.includes(sp.redirect_uri))) return <Err msg={t("badRedirect")} />;
  if (sp.response_type !== "code" || sp.code_challenge_method !== "S256" || !sp.code_challenge || !/^[A-Za-z0-9_-]{43}$/.test(sp.code_challenge)) {
    return <Err msg={t("pkce")} />;
  }
  const h = await headers();
  const reqOrigin = `${h.get("x-forwarded-proto")?.split(",")[0] ?? "http"}://${h.get("host")}`;
  if (!resourceMatches(sp.resource, requestOrigin(project, { headers: h, nextUrl: { origin: reqOrigin } }), slug)) return <Err msg={t("badResource")} detail={sp.resource} />;

  if (!user) {
    const here = `/${slug}/oauth/authorize?${new URLSearchParams(sp as Record<string, string>).toString()}`;
    const login = loginHref(project, here);
    if (login) redirect(login);
    return <Err msg={t("noLogin")} />;
  }

  let name = legacy?.name ?? "";
  let logo: string | undefined;
  let uris = legacy?.redirectUris ?? [];
  if (cimd) {
    try {
      const meta = await resolveClientMetadata(clientId, { allowFetch: () => allow("cimd", clientIp(h)) });
      ({ name, redirectUris: uris } = meta);
      logo = meta.logoUri;
    } catch (e) {
      return <Err msg={t("cimdFailed")} detail={e instanceof CimdError ? e.message : undefined} />;
    }
    if (!uris.includes(sp.redirect_uri)) return <Err msg={t("badRedirect")} />;
  }

  const cap = maxScope(user);
  const asked = (sp.scope ?? "").split(/\s+/);
  const preselect = asked.includes("triage") && cap === "triage" ? "triage" : asked.includes("write") ? "write" : "read";
  const decide = decideOAuth.bind(null, slug, { clientId, redirectUri: sp.redirect_uri, state: sp.state ?? "", challenge: sp.code_challenge });
  const back = new URL(sp.redirect_uri).host;
  const local = loopbackOnly([sp.redirect_uri]);
  const domain = cimd ? new URL(clientId).host : undefined;

  return (
    <AuthShell
      title={t("title", { client: name })}
      lede={t.rich("lede", { project: project.name, user: user.name ?? user.email ?? "", b: (c) => <b className="font-semibold text-foreground break-all">{c}</b> })}
      foot={t("foot")}
    >
      <form action={decide} className="grid gap-5">
        <div className="grid gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {logo ? (
              // Remote, self-asserted logo: plain <img>, no referrer, never proxied through us.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" width={40} height={40} referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-lg border bg-background object-contain" />
            ) : (
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground"><Globe className="size-5" /></span>
            )}
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">{name}</div>
              {domain
                ? <div className="truncate font-mono text-[13px] text-foreground" title={clientId}>{domain}</div>
                : <div className="text-[13px] text-muted-foreground">{t("legacyClient")}</div>}
            </div>
          </div>
          <div className="grid gap-1 text-[13px] leading-snug text-muted-foreground">
            {domain && <div>{t.rich("identity", { domain, b: (c) => <b className="font-mono font-medium break-all text-foreground">{c}</b> })}</div>}
            <div>{t.rich("returnsTo", { host: back, b: (c) => <b className="font-mono font-medium break-all text-foreground">{c}</b> })}</div>
          </div>
          {local && (
            <Alert className="border-warn/40 [&>svg]:text-warn">
              <AlertTriangle />
              <AlertTitle className="line-clamp-none">{t("localTitle")}</AlertTitle>
              <AlertDescription>{t("local", { client: name })}</AlertDescription>
            </Alert>
          )}
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-[14px] font-semibold">{t("what")}</legend>
          {SCOPES.filter((v) => v !== "triage" || cap === "triage").map((v) => ({ value: v, title: t(`scopes.${v}.title`), text: t(`scopes.${v}.text`) })).map((sc) => (
            <label key={sc.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors hover:border-line-strong has-[:checked]:border-primary has-[:checked]:bg-brand-soft/50 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50">
              <input type="radio" name="scope" value={sc.value} defaultChecked={preselect === sc.value} className="mt-1 size-4 shrink-0 accent-primary" />
              <span className="text-[14px] leading-snug"><b className="font-semibold">{sc.title}</b> <span className="text-muted-foreground">— {sc.text}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <Button type="submit" size="lg" name="decision" value="allow">{t("allow")}</Button>
          <Button type="submit" size="lg" variant="outline" name="decision" value="deny">{t("deny")}</Button>
        </div>
      </form>
    </AuthShell>
  );
}
