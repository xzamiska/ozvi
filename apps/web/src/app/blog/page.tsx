import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogShell } from "@/components/blog/BlogShell";
import { BLOG_POSTS } from "@/lib/blog";
import { cloudOnly } from "@/lib/legal";
import { pageMeta } from "@/lib/seo";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const m = pageMeta({ title: "Blog – Ozvi", description: "How Ozvi works under the hood and how to get more out of bug reports, feedback boards and release notes.", path: "/blog", locale: "en" });
  return { ...m, alternates: { ...m.alternates, types: { "application/rss+xml": "/blog/feed.xml" } } };
}

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** ozvi.io/blog: the list of articles, newest first. Cloud only. */
export default function Blog() {
  if (!cloudOnly()) notFound();
  return (
    <BlogShell>
      <div className="max-w-[72ch]">
        <h1 className="font-heading text-[30px] leading-tight font-bold tracking-tight md:text-[38px]">Blog</h1>
        <p className="mt-3 text-[17px] leading-[1.6] text-muted-foreground">How Ozvi works under the hood, and how to get more out of bug reports, feedback boards and release notes.</p>
        <ol className="mt-12 grid gap-10">
          {BLOG_POSTS.map((p) => (
            <li key={p.slug} className="border-t pt-6">
              <time dateTime={p.date} className="text-[13.5px] text-muted-foreground">{fmt(p.date)}</time>
              <h2 className="mt-1 font-heading text-[22px] leading-snug font-bold tracking-tight">
                <Link href={`/blog/${p.slug}`} className="hover:underline hover:decoration-2 hover:underline-offset-4">{p.title}</Link>
              </h2>
              <p className="mt-2 text-[15.5px] leading-relaxed text-muted-foreground">{p.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </BlogShell>
  );
}
