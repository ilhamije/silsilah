import { mergeConfig, type MergeConfig } from "./config";
import { normalizeName, type NormalizedName } from "./normalize";

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a.length ? 1 : 0;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array<boolean>(a.length).fill(false);
  const bm = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(b.length - 1, i + range);
    for (let j = lo; j <= hi; j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Similarity of two normalized names; 0 when they are not a name match. */
export function nameSimilarity(a: NormalizedName, b: NormalizedName, cfg: MergeConfig = mergeConfig): number {
  if (!a.full || !b.full) return 0;
  const full = jaroWinkler(a.full, b.full);
  if (full >= cfg.nameSimilarity) return full;
  // "Ahmad Hasan" inside "Muhammad Ahmad Hasan": every token of the shorter name, in order.
  const [short, long] = a.tokens.length <= b.tokens.length ? [a.tokens, b.tokens] : [b.tokens, a.tokens];
  if (short.length >= 2 && short.length < long.length) {
    let i = 0;
    for (const tok of long) if (tok === short[i]) i++;
    if (i === short.length) return Math.max(full, cfg.nameSimilarity);
  }
  if (a.given && a.given === b.given) {
    const familyOk = !a.family || !b.family || jaroWinkler(a.family, b.family) >= cfg.nameSimilarity;
    // Same given name with compatible family names is a match, but weaker than a near-identical full name.
    if (familyOk) return Math.max(full, cfg.nameSimilarity);
  }
  return 0;
}

export type NameFields = { fullName: string; nicknames?: string[] };

/** Best similarity over the full name and every nickname on both sides. */
export function bestNameSimilarity(a: NameFields, b: NameFields, cfg: MergeConfig = mergeConfig): number {
  const names = (p: NameFields) => [p.fullName, ...(p.nicknames ?? [])].map((n) => normalizeName(n, cfg));
  let best = 0;
  for (const x of names(a)) for (const y of names(b)) best = Math.max(best, nameSimilarity(x, y, cfg));
  return best;
}

/** Father's name agreeing is a small bonus used only to break ties. */
export function fatherNameBonus(a: NameFields, b: NameFields, cfg: MergeConfig = mergeConfig): number {
  const fa = normalizeName(a.fullName, cfg).fatherTokens.join(" ");
  const fb = normalizeName(b.fullName, cfg).fatherTokens.join(" ");
  return fa && fb && jaroWinkler(fa, fb) >= cfg.nameSimilarity ? 0.02 : 0;
}
