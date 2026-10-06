import { mergeConfig, type MergeConfig } from "./config";
import { bestNameSimilarity, fatherNameBonus } from "./similarity";
import type { MergePerson, MergeTree } from "./types";

export type Candidate = { a: MergePerson; b: MergePerson; similarity: number };

/** True when two people cannot be the same person whatever their names say. */
export function hardConflict(a: MergePerson, b: MergePerson, cfg: MergeConfig = mergeConfig): boolean {
  if (a.birthYear != null && b.birthYear != null && Math.abs(a.birthYear - b.birthYear) > cfg.maxBirthYearGap) {
    return true;
  }
  return a.gender !== "UNKNOWN" && b.gender !== "UNKNOWN" && a.gender !== b.gender;
}

/** Name-level pairs between two trees, hard conflicts removed. */
export function findCandidates(a: MergeTree, b: MergeTree, cfg: MergeConfig = mergeConfig): Candidate[] {
  const out: Candidate[] = [];
  for (const pa of a.people) {
    for (const pb of b.people) {
      if (hardConflict(pa, pb, cfg)) continue;
      const s = bestNameSimilarity(pa, pb, cfg);
      if (s > 0) out.push({ a: pa, b: pb, similarity: Math.min(1, s + fatherNameBonus(pa, pb, cfg)) });
    }
  }
  return out;
}
