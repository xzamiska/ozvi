import "server-only";
import { GITHUB_REPO } from "./seo";

/**
 * Stars of Ozvi's public repository for the landing's "star us" link. Cached for an hour; null when GitHub
 * does not answer or the count is still small (a "0" next to the button helps nobody).
 */
export async function githubStars(min = 10): Promise<number | null> {
  try {
    const repo = new URL(GITHUB_REPO).pathname.replace(/^\/|\/$/g, "");
    const r = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "ozvi" },
      next: { revalidate: 3600 }, signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const n = Number(((await r.json()) as { stargazers_count?: number }).stargazers_count);
    return Number.isFinite(n) && n >= min ? n : null;
  } catch { return null; }
}
