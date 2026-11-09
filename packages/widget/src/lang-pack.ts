/**
 * Language packs for the languages that are not inlined in widget.js (Polish, Hungarian, German).
 * widget.js keeps Slovak, Czech and English inline (20 kB gzip budget); for pl/hu/de it loads
 * widget-lang-<lang>.js once, before the panel is first rendered, and falls back to English only if
 * that request fails. One pack holds the strings of every chunk (main panel, ideas, annotation,
 * embeds), so the lazy chunks never need a second request.
 *
 * Each pack file (lang/pl.ts, lang/hu.ts, lang/de.ts) calls registerPack(); build.mjs bundles each to
 * public/widget-lang-<lang>.js. Keys mirror the English tables in index.tsx, ideas.tsx, annotate.ts.
 */

export const PACK_LANGS = ["pl", "hu", "de"] as const;
export type PackLang = (typeof PACK_LANGS)[number];

export interface LangPack {
  lang: PackLang;
  /** index.tsx T.en */
  main: Record<string, string | string[]>;
  /** ideas.tsx T.en (votes/weight/left are functions: plural rules differ per language). */
  ideas: Record<string, string | ((...n: number[]) => string)>;
  /** annotate.ts T.en */
  annotate: Record<string, string>;
  /** embeds.tsx T.en (votes/freshN are functions). */
  embeds: Record<string, string | ((n: number) => string)>;
}

type PackWindow = Window & { __ozviLangPacks?: Partial<Record<PackLang, LangPack>> };

export function registerPack(pack: LangPack) {
  const w = window as PackWindow;
  (w.__ozviLangPacks ??= {})[pack.lang] = pack;
}

export function packFor(lang: string): LangPack | undefined {
  return (window as PackWindow).__ozviLangPacks?.[lang as PackLang];
}
