/** Project addresses (/<slug>): what a slug may look like and which words are taken by Ozvi's own routes. */
export const PROJECT_SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;

export const RESERVED_SLUGS = new Set(["app", "api", "mcp", "dev", "demo", "admin", "www", "static", "login", "signup", "billing", "docs", "help", "status", "widget", "fonts", "oauth", "well-known",
  "mail", "smtp", "imap", "ns1", "ns2", "cdn", "assets", "staging", "blog", "domains", "cname", "support", "security", "abuse", "ozvi", "pay", "checkout", "send", "rsend",
  "podmienky", "sukromie", "pristupnost", "accessibility", "legal", "terms", "privacy", "subprocessors", "releases", "dpa", "invite", "account", "pricing", "sk", "cs", "en", "de", "pl", "hu",
  // comparison pages (lib/compare.ts COMPARE_ROOTS)
  "vs", "alternativa-k-fideru"]);

/** Ozvi's own board (OZVI_FEEDBACK_PROJECT): nobody else may take its address, and it keeps it. */
export const ownBoardSlug = () => process.env.OZVI_FEEDBACK_PROJECT?.trim().toLowerCase() || null;

export const slugAllowed = (slug: string) => PROJECT_SLUG.test(slug) && !RESERVED_SLUGS.has(slug);
