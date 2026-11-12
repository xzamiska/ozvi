import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogCta, BlogShell } from "@/components/blog/BlogShell";
import { PROSE } from "@/components/docs/DocsShell";
import { BLOG_BODIES } from "@/content/blog";
import { blogPost } from "@/lib/blog";
import { publicUrl } from "@/lib/email/url";
import { cloudOnly } from "@/lib/legal";
import { pageMeta } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = blogPost((await params).slug);
  if (!post) return {};
  const m = pageMeta({ title: `${post.title} – Ozvi`, description: post.description, path: `/blog/${post.slug}`, locale: "en" });
  return {
    ...m,
    openGraph: { ...m.openGraph, type: "article", publishedTime: post.date, ...(post.image && { images: [{ url: post.image }] }) },
    ...(post.image && { twitter: { ...m.twitter, images: [post.image] } }),
  };
}

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function BlogArticle({ params }: Props) {
  if (!cloudOnly()) notFound();
  const { slug } = await params;
  const post = blogPost(slug);
  const Body = BLOG_BODIES[slug];
  if (!post || !Body) notFound();
  const base = publicUrl();
  const jsonLd = {
    "@context": "https://schema.org", "@type": "BlogPosting",
    headline: post.title, description: post.description, datePublished: post.date, inLanguage: "en",
    mainEntityOfPage: `${base}/blog/${post.slug}`, ...(post.image && { image: `${base}${post.image}` }),
    author: { "@type": "Organization", name: "Ozvi", url: base }, publisher: { "@type": "Organization", name: "Ozvi", url: base },
    keywords: post.tags.join(", "),
  };
  return (
    <BlogShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <article className="max-w-[72ch]">
        <p className="text-[13.5px] text-muted-foreground"><Link href="/blog" className="hover:text-foreground">Blog</Link> · <time dateTime={post.date}>{fmt(post.date)}</time></p>
        <h1 className="mt-2 font-heading text-[30px] leading-tight font-bold tracking-tight md:text-[40px]">{post.title}</h1>
        <p className="mt-3 text-[17.5px] leading-relaxed text-muted-foreground">{post.description}</p>
        <div className={PROSE.replace("mt-10 max-w-[80ch]", "mt-10")}><Body /></div>
        <BlogCta />
      </article>
    </BlogShell>
  );
}
