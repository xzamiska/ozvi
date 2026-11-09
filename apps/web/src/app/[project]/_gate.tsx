import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState, Page } from "@/components/ozvi/page";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/locales";
import { loginHref, type Project } from "@/lib/project";

/**
 * A page the viewer may not see. Always one primary action: sign in when this board has a way to,
 * otherwise back to a page they can see. `signedIn` gates (wrong role) never offer a login.
 */
export async function Gate({ project, locale, title, text, returnTo, signedIn = false, wide = false }: {
  project: Project; locale: Locale; title: string; text: string; returnTo: string; signedIn?: boolean; wide?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "board.gate" });
  const login = signedIn ? null : loginHref(project, returnTo);
  const back = project.ideasPublic || signedIn ? `/${project.slug}/ideas` : null;
  const action = login
    ? <Button asChild size="lg"><a href={login}>{t("signIn")}</a></Button>
    : back ? <Button asChild size="lg" variant="outline"><Link href={back}>{t("backToIdeas")}</Link></Button>
    : null;
  return (
    <Page>
      <EmptyState level={1} title={title} text={text} action={action} className={wide ? undefined : "mx-auto max-w-[640px]"} />
    </Page>
  );
}

/** The gate sentence: `withLogin` when this board can sign people in, otherwise where sign-in happens. */
export async function signInText(project: Project, locale: Locale, withLogin: string): Promise<string> {
  if (loginHref(project, "/")) return withLogin;
  return (await getTranslations({ locale, namespace: "board.gate" }))("viaApp", { app: project.name });
}
