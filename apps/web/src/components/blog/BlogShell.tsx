import { parseTheme, presets, toCss } from "@ozvi/theme";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { OzviLogo } from "../ozvi/Logo";

const theme = parseTheme(presets.ozvi);

/** Frame for ozvi.io/blog: Ozvi's own theme, a reading column, a quiet header and a call to action at the end. English only. */
export async function BlogShell({ children }: { children: React.ReactNode }) {
  // English page: client parts (copy buttons) speak English whatever the visitor's locale is.
  const messages = await getMessages({ locale: "en" });
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <style>{toCss(theme)}</style>
      <div lang="en" className="flex min-h-dvh flex-col bg-background">
        <header className="border-b bg-surface">
          <div className="oz-frame flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2 md:min-h-16">
            <div className="flex items-center gap-3">
              <Link href="/en" aria-label="Ozvi home"><OzviLogo /></Link>
              <span aria-hidden className="h-5 w-px bg-line" />
              <Link href="/blog" className="font-mono text-[12.5px] text-muted-foreground hover:text-foreground">blog</Link>
            </div>
            <nav aria-label="Ozvi" className="flex items-center gap-1 text-[14px] font-medium">
              <Link href="/docs/widget" className="inline-flex min-h-9 items-center rounded-md px-2.5 text-muted-foreground hover:bg-wash hover:text-foreground">Docs</Link>
              <Link href="/en/demo" className="inline-flex min-h-9 items-center rounded-md px-2.5 text-muted-foreground hover:bg-wash hover:text-foreground">Live demo</Link>
              <Link href="/en#pricing" className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 text-primary-foreground hover:opacity-90">Try it free</Link>
            </nav>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="oz-frame flex-1 pt-10 pb-24 md:pt-14">{children}</main>
        <footer className="border-t bg-surface">
          <div className="oz-frame flex flex-wrap justify-between gap-3 py-6 text-[13px] text-muted-foreground">
            <span>© {new Date().getFullYear()} Ozvi</span>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/blog/feed.xml" className="hover:text-foreground">RSS</Link>
              <a href="https://www.youtube.com/@ozviapp" className="hover:text-foreground">YouTube</a>
              <a href="https://github.com/xzamiska/ozvi" className="hover:text-foreground">GitHub</a>
            </span>
          </div>
        </footer>
      </div>
    </NextIntlClientProvider>
  );
}

/** The end of every article: what Ozvi is, in one breath, and where to try it. */
export function BlogCta() {
  return (
    <aside className="mt-16 rounded-2xl border bg-surface p-6 md:p-8">
      <h2 className="font-heading text-[22px] leading-tight font-bold tracking-tight">Bug reports with the context, an idea board with the roadmap.</h2>
      <p className="mt-2 max-w-[60ch] text-[15.5px] leading-relaxed text-muted-foreground">
        Ozvi lives inside your app: customers report bugs with a masked screenshot, the steps and the failed request, vote on ideas, and hear back when you ship. Source-available, self-host for free or use the cloud.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/en?utm_source=blog&utm_campaign=cta" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground hover:opacity-90">Try Ozvi free</Link>
        <Link href="/en/demo?utm_source=blog&utm_campaign=cta" className="inline-flex min-h-11 items-center rounded-lg border bg-background px-4 font-semibold hover:bg-wash">See the live demo</Link>
      </div>
    </aside>
  );
}

/** A figure with a caption; images live in /public/blog. */
export function Figure({ src, alt, caption, width, height }: { src: string; alt: string; caption?: React.ReactNode; width: number; height: number }) {
  return (
    <figure className="my-7">
      {/* eslint-disable-next-line @next/next/no-img-element -- static files from /public, sized */}
      <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" className="h-auto w-full rounded-xl border bg-surface" />
      {caption && <figcaption className="mt-2 text-[13.5px] text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}
