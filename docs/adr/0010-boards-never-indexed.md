# 0010 — Boards are never indexed

**Status:** accepted 2026-11-10

**Context.** Before ozvi.io launched, the owner asked whether projects have indexing turned off. Boards hold the ideas and complaints of the customer's users. We considered a project setting ("Show in search engines").

**Decision.**
- **Boards are never indexed:** on subdomains, custom domains, the main domain or in self-host. **It is not a setting** and will not be.
- Only Ozvi's own public pages in the cloud on the main domain may be indexed: the landing page in all languages, the documentation, releases and legal pages (`lib/indexing.ts`).
- Every other response gets the header `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` (`proxy.ts`).
- `robots.txt` on hosts with boards does **not** disallow crawling. A search engine has to fetch the page to see the noindex header. A disallow in `robots.txt` could leave a bare address from someone else's link in the index.
- Staging additionally has basic auth and its own `robots.txt` at the edge.

**Consequences.** A customer who wants a public roadmap in search engines has to publish it on their own website. Ozvi will not be a source of SEO for customers.
