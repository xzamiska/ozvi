/**
 * Which of Ozvi's languages a post is written in, without calling anything: letters only one
 * language uses, plus its most frequent short words. Good enough to decide whether to offer
 * "Translate" (a wrong guess only shows or hides a button); null when the text is too short or
 * the evidence is weak.
 */

/** Languages the detector knows (Ozvi's UI languages). */
export const DETECTABLE = ["sk", "cs", "pl", "hu", "de", "en"] as const;
export type Lang = (typeof DETECTABLE)[number];
const LOCALES = DETECTABLE;

const WORDS: Record<Lang, string[]> = {
  sk: ["a", "je", "sa", "na", "v", "to", "že", "som", "by", "ako", "pre", "ale", "aj", "nie", "do", "pri", "keď", "alebo", "ktorý", "ktoré", "mi", "sme", "tak", "už", "len", "byť", "bolo", "chcem", "prosím", "ďakujem", "všetky", "veľmi", "však", "tiež", "môže", "možnosť", "nefunguje", "faktúry", "aby"],
  cs: ["a", "je", "se", "na", "v", "to", "že", "jsem", "by", "jako", "pro", "ale", "i", "ne", "do", "při", "když", "nebo", "který", "které", "mi", "jsme", "tak", "už", "jen", "být", "bylo", "chci", "prosím", "děkuji", "všechny", "velmi", "však", "také", "může", "možnost", "nefunguje", "faktury", "aby", "bych"],
  pl: ["i", "jest", "się", "na", "w", "to", "że", "jestem", "by", "jak", "dla", "ale", "też", "nie", "do", "przy", "kiedy", "lub", "albo", "który", "które", "mi", "jesteśmy", "tak", "już", "tylko", "być", "było", "chcę", "proszę", "dziękuję", "wszystkie", "bardzo", "jednak", "może", "możliwość", "działa", "faktury", "aby", "żeby", "czy", "jeśli"],
  hu: ["a", "az", "és", "hogy", "nem", "is", "egy", "van", "meg", "csak", "de", "ha", "már", "mint", "vagy", "még", "kell", "lehet", "szeretném", "kérem", "köszönöm", "minden", "nagyon", "ezt", "azt", "nincs", "lenne", "számla", "számlák", "amikor", "mert", "ami", "aki", "jó", "után", "nekem"],
  de: ["und", "ist", "die", "der", "das", "nicht", "ich", "ein", "eine", "zu", "mit", "auf", "für", "es", "sich", "auch", "wenn", "oder", "aber", "wir", "sie", "bei", "kann", "möchte", "bitte", "danke", "alle", "sehr", "noch", "wäre", "funktioniert", "rechnung", "rechnungen", "dass", "von", "den", "dem", "werden", "wird"],
  en: ["the", "and", "is", "to", "of", "in", "it", "that", "for", "on", "with", "be", "this", "would", "can", "not", "are", "when", "or", "but", "we", "please", "thanks", "all", "very", "also", "could", "should", "works", "invoice", "invoices", "have", "has", "an", "from", "will", "there", "my"],
};

/** Letters that point to one language (or a small family); weight per occurrence. */
const LETTERS: Record<Lang, [RegExp, number][]> = {
  sk: [[/[ľĺŕô]/g, 3], [/ä/g, 1], [/[ťď]/g, 0.5]],
  cs: [[/[řů]/g, 3], [/ě/g, 3]],
  pl: [[/[ąęłńśźżć]/g, 3]],
  hu: [[/[őű]/g, 4], [/[áéíóú]/g, 0.3]],
  de: [[/ß/g, 4], [/[äöü]/g, 1]],
  en: [],
};

const SETS = Object.fromEntries(LOCALES.map((l) => [l, new Set(WORDS[l])])) as Record<Lang, Set<string>>;

export function detectLanguage(text: string): Lang | null {
  const clean = text.toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/`[^`]*`/g, " ");
  const words = clean.match(/\p{L}+/gu) ?? [];
  if (words.length < 3 && clean.replace(/\s/g, "").length < 16) return null;
  const score = Object.fromEntries(LOCALES.map((l) => [l, 0])) as Record<Lang, number>;
  for (const w of words) for (const l of LOCALES) if (SETS[l].has(w)) score[l] += 1;
  for (const l of LOCALES) for (const [re, weight] of LETTERS[l]) score[l] += (clean.match(re)?.length ?? 0) * weight;
  // German umlauts also appear in Hungarian (ö, ü) and Slovak (ä): only ő/ű/ß decide those.
  const ranked = [...LOCALES].sort((a, b) => score[b] - score[a]);
  const [best, second] = [ranked[0]!, ranked[1]!];
  if (score[best] < 2 || score[best] < score[second] * 1.25 + 0.5) return null;
  return best;
}

/** True when a post in `source` should offer a translation to a viewer reading in `viewer`. */
export function isForeign(source: Lang | null, viewer: string): boolean {
  return source !== null && source !== viewer;
}
