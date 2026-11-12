/**
 * Ozvi's blog (ozvi.io/blog, cloud only): articles in English, written as React components in
 * src/content/blog/<slug>.tsx so code samples and images use the same blocks as the docs.
 * Newest first. /blog/feed.xml lists them (dev.to and Hashnode import it with a canonical link).
 */
export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** YYYY-MM-DD */
  date: string;
  /** Image under /public, used on the list and as og:image. */
  image?: string;
  tags: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "sign-in-users-to-an-embedded-widget",
    title: "Sign your users in to an embedded widget with one signed token",
    description: "How Ozvi knows who is reporting a bug without a second login: a short-lived HS256 token from your backend, in Node.js, Python or PHP, and what to put in it.",
    date: "2026-11-12",
    tags: ["sso", "jwt", "widget", "node", "python", "php"],
  },
  {
    slug: "hide-private-data-in-bug-report-screenshots",
    title: "How we hide private data in bug report screenshots",
    description: "Screenshots make bug reports useful and leak e-mails, phone numbers and card numbers. Ozvi covers them in the browser, on a copy of the page, before a single pixel exists. Here is how.",
    date: "2026-11-12",
    image: "/blog/screenshot-after.webp",
    tags: ["privacy", "screenshots", "gdpr", "javascript"],
  },
];

export const blogPost = (slug: string) => BLOG_POSTS.find((p) => p.slug === slug);
