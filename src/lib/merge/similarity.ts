import type { MergeConfig } from "./config";
import { normalizeName, type NormalizedName } from "./normalize";

export type MatchPerson = {
  id: string;
  fullName: string;
  givenName?: string | null;
  familyName?: string | null;
  nicknames?: string[];
  gender?: "MALE" | "FEMALE" | "UNKNOWN" | string;
  birthYear?: number | null;
};

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
      if (!bm[j] && a[i] === b[j]) {
        am[i] = bm[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

function variants(p: MatchPerson): NormalizedName[] {
  const out = [normalizeName(p.fullName, p.givenName, p.familyName)];
  for (const n of p.nicknames ?? []) if (n.trim()) out.push(normalizeName(n));
  return out.filter((v) => v.full);
}

function familyCompatible(a: string, b: string, threshold: number) {
  return !a || !b || a === b || jaroWinkler(a, b) >= threshold;
}

/** Hard conflicts that rule a pair out regardless of name similarity. */
export function conflicts(a: MatchPerson, b: MatchPerson, cfg: MergeConfig): boolean {
  if (a.birthYear != null && b.birthYear != null && Math.abs(a.birthYear - b.birthYear) > cfg.maxBirthYearGap) {
    return true;
  }
  const known = (g?: string) => g === "MALE" || g === "FEMALE";
  return known(a.gender) && known(b.gender) && a.gender !== b.gender;
}

/** Best name similarity (0 when the pair is not a name match). */
export function nameSimilarity(a: MatchPerson, b: MatchPerson, cfg: MergeConfig): number {
  if (conflicts(a, b, cfg)) return 0;
  let best = 0;
  for (const x of variants(a)) {
    for (const y of variants(b)) {
      let s = jaroWinkler(x.full, y.full);
      if (s < cfg.nameSimilarity && x.given && x.given === y.given && familyCompatible(x.family, y.family, cfg.nameSimilarity)) {
        s = cfg.nameSimilarity;
      }
      if (s < cfg.nameSimilarity) continue;
      if (x.father && x.father === y.father) s = Math.min(1, s + 0.02); // bonus signal
      best = Math.max(best, s);
    }
  }
  return best;
}
