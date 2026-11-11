import type { FullApi } from "./api";
import type { OzviLang } from "./types";

/**
 * What widget.js shares with its lazy chunks (widget-ideas.js, widget-embeds.js) through window.__ozviP:
 * the one Preact instance (hooks only work with the copy that renders them), the CSP nonce, the script
 * loader and the cached project config. Chunks import "preact" normally; build.mjs maps it to this object.
 */
/** sections: the board sections the project uses (missing on older servers = all). */
export interface ProjectConfig { name: string; css: string; fonts: string | null; ideasPublic?: boolean; sections?: string[] }

export interface Shared {
  preact: unknown; hooks: unknown; jsx: unknown;
  nonce: string;
  /** Where widget.js came from: the default Ozvi host. */
  origin: string;
  api: FullApi;
  load(url: string): Promise<void>;
  config(host: string, project: string): Promise<ProjectConfig | null>;
  lang(el: HTMLElement): OzviLang;
}

export const shared = () => (window as unknown as { __ozviP: Shared }).__ozviP;

/** Fetches JSON from the Ozvi API; the error text from the server (already in the right language) is thrown. */
export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((data as { error?: string }).error || String(r.status)), { status: r.status, data });
  return data as T;
}
