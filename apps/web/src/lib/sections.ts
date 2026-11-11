/**
 * Board sections a project can switch off (settings → Board sections). Off means hidden everywhere
 * (board, widget, embeds, API, MCP, GitHub release drafts) with the data kept; switching back on
 * brings it all back. The roadmap is made of ideas, so it needs ideas; one section always stays on.
 */
export const SECTIONS = ["ideas", "roadmap", "changelog", "bugs"] as const;
export type Section = (typeof SECTIONS)[number];

export interface HasSections { sections?: readonly string[] | null; homeSection?: string | null }

const isSection = (v: unknown): v is Section => typeof v === "string" && (SECTIONS as readonly string[]).includes(v);

/** The enabled sections in board order, after the rules (roadmap needs ideas, never none). */
export function enabledSections(p: HasSections): Section[] {
  const want = new Set((p.sections ?? SECTIONS).filter(isSection));
  if (!want.has("ideas")) want.delete("roadmap");
  const on = SECTIONS.filter((s) => want.has(s));
  return on.length > 0 ? on : [...SECTIONS];
}

export const sectionOn = (p: HasSections, s: Section) => enabledSections(p).includes(s);

/** Where the board opens: the chosen section if it is on, else the first enabled one. */
export function homeSection(p: HasSections): Section {
  const on = enabledSections(p);
  return isSection(p.homeSection) && on.includes(p.homeSection) ? p.homeSection : on[0]!;
}

/** Which section an item kind belongs to. */
export const sectionOfKind = (kind: string): Section => (kind === "bug" ? "bugs" : "ideas");

/** What a settings form sends, made valid (the same rules as enabledSections). */
export function normalizeSections(input: readonly string[], home: string | null | undefined): { sections: Section[]; homeSection: Section } {
  const sections = enabledSections({ sections: input });
  return { sections, homeSection: homeSection({ sections, homeSection: home }) };
}
