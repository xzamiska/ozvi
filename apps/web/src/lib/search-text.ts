import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * Accent-insensitive search without a database extension: both the column and the query are lowercased and
 * folded to plain letters (Slovak, Czech, Polish, Hungarian, German and other Latin letters), so "tmavy rezim"
 * finds "Tmavý režim" and "faktur" finds "faktúr". The same map runs in SQL (translate) and in JS (fold).
 */
const LETTERS: [string, string][] = [
  ["a", "áäàâãåą"], ["c", "ćčç"], ["d", "ďđ"], ["e", "éěëèêę"], ["i", "íìîï"], ["l", "ĺľł"], ["n", "ńňñ"],
  ["o", "óôöőòõø"], ["r", "ŕř"], ["s", "śš"], ["t", "ť"], ["u", "úůüűùû"], ["y", "ýÿ"], ["z", "źżž"],
];
const lowerFrom = LETTERS.map(([, a]) => a).join("");
const lowerTo = LETTERS.map(([p, a]) => p.repeat([...a].length)).join("");
// Upper case too, in case the database's lower() doesn't know these letters (C collation).
const FROM = lowerFrom + lowerFrom.toUpperCase();
const TO = lowerTo + lowerTo;
const MAP = new Map([...FROM].map((c, i) => [c, TO[i]!]));

/** Lowercase, plain letters ("Faktúr" → "faktur", "Straße" → "strasse"). */
export function fold(s: string): string {
  return [...s.toLowerCase()].map((c) => MAP.get(c) ?? c).join("").replace(/ß/g, "ss");
}

/** The same folding of a column in SQL. */
export function foldSql(col: SQLWrapper): SQL<string> {
  return sql<string>`replace(translate(lower(${col}), ${FROM}, ${TO}), 'ß', 'ss')`;
}

/** Substring match, accents ignored (board search). */
export function containsFolded(col: SQLWrapper, q: string): SQL {
  return sql`strpos(${foldSql(col)}, ${fold(q)}) > 0`;
}

/** Common short words that say nothing about the topic (sk, cs, en, a few pl/hu/de). */
const STOP = new Set([
  // sk / cs
  "ako", "aby", "ale", "alebo", "ani", "bez", "pre", "pri", "pod", "nad", "pred", "cez", "kde", "ked", "kedy", "len", "lebo",
  "som", "sme", "ste", "byt", "bol", "bola", "bude", "tak", "tam", "tem", "ten", "tento", "tato", "toto", "tie", "ich", "jeho",
  "jej", "mam", "mat", "moc", "uz", "este", "aj", "nie", "ano", "pro", "jak", "nebo", "jsem", "jsou", "neni", "byl", "bude", "taky",
  "take", "tez", "jen", "kdyz", "ktery", "ktora", "ktory", "ktore", "ktere", "co", "sa", "si", "na", "do", "od", "po", "za", "by",
  "mozno", "mozna", "treba", "potrebujem", "chcem", "chci", "nejaky", "nejake", "nieco", "neco", "vsetky", "vsechny",
  // en
  "the", "and", "for", "with", "from", "that", "this", "you", "your", "are", "not", "but", "can", "its", "have", "has", "was",
  "will", "would", "should", "could", "into", "about", "all", "any", "please", "add", "option", "able", "when", "what", "how",
  // pl / hu / de
  "jest", "nie", "dla", "przy", "oraz", "lub", "egy", "nem", "hogy", "und", "der", "die", "das", "mit", "fur", "von", "ein", "eine",
]);

/** Search words for similar ideas: folded, 3+ letters, no stop-words, unique, at most 6. */
export function searchWords(q: string | null | undefined): string[] {
  const words = fold(q ?? "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w));
  return [...new Set(words)].slice(0, 6);
}

/**
 * Ranking for similar ideas: how many of `words` start a word in any of `cols` (prefix match, accents ignored),
 * so "pre" never matches "vopred" and an idea matching two words outranks a popular one matching one.
 * Callers keep rows with score > 0 and order by score, then votes.
 */
export function matchScore(cols: SQLWrapper[], words: string[]): SQL<number> {
  if (words.length === 0) return sql<number>`0`;
  const one = (w: string) => {
    const re = `\\m${w}`;
    return sql`(case when ${sql.join(cols.map((c) => sql`coalesce(${foldSql(c)}, '') ~ ${re}`), sql` or `)} then 1 else 0 end)`;
  };
  return sql<number>`(${sql.join(words.map(one), sql` + `)})`;
}
