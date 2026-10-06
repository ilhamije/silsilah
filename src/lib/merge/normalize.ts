import { mergeConfig, type MergeConfig } from "./config";

export type NormalizedName = {
  /** Canonical tokens of the person's own name (patronymic removed). */
  tokens: string[];
  /** Tokens after "bin"/"binti"/"bt", when present. A bonus signal only. */
  fatherTokens: string[];
  full: string;
  given: string;
  family: string;
};

const PATRONYMIC = new Set(["bin", "binti", "bte", "bt", "ibnu", "ibn"]);

function stripMarks(s: string) {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

function canonicalToken(tok: string, cfg: MergeConfig) {
  let t = tok;
  for (const [from, to] of cfg.spellings) t = t.replaceAll(from, to);
  return cfg.variants[t] ?? t;
}

/** "H. Muhammad Soerjo, S.H." → tokens ["muhammad", "surjo"]. */
export function normalizeName(raw: string, cfg: MergeConfig = mergeConfig): NormalizedName {
  const honorifics = new Set(cfg.honorifics);
  // Dots and commas vanish so "S.H." becomes "sh" and "M." becomes "m".
  const cleaned = stripMarks(raw)
    .replace(/[.,]/g, "")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/'/g, "");
  const words = cleaned.split(/\s+/).filter(Boolean);
  const own: string[] = [];
  const father: string[] = [];
  let seenPatronymic = false;
  for (const w of words) {
    if (PATRONYMIC.has(w)) {
      seenPatronymic = true;
      continue;
    }
    if (honorifics.has(w) && words.length > 1) continue;
    (seenPatronymic ? father : own).push(canonicalToken(w, cfg));
  }
  const given = own[0] ?? "";
  const family = own.length > 1 ? own[own.length - 1] : "";
  return { tokens: own, fatherTokens: father, full: own.join(" "), given, family };
}

/** Coarse phonetic key: consonant skeleton, so "Siti" and "Sitti" agree. */
export function phoneticKey(token: string): string {
  const t = token.replace(/(.)\1+/g, "$1");
  return t[0] + t.slice(1).replace(/[aeiouyhw]/g, "");
}

/** Indexed lookup key for cross-tree candidates: phonetic key of the first given name. */
export function nameKeyOf(fullName: string): string {
  const n = normalizeName(fullName);
  return n.given ? phoneticKey(n.given) : "";
}
