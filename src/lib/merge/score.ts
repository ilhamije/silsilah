import { createHash } from "node:crypto";
import { mergeConfig, type MergeConfig } from "./config";
import type { MatchedPair } from "./types";

export type Band = "HIGH" | "MEDIUM" | "LOW";

export function pairWeight(p: MatchedPair, cfg: MergeConfig = mergeConfig): number {
  if (p.kinds.length === 1 && p.kinds[0] === "spouse") return cfg.spouseWeight;
  return cfg.weights[p.distance] ?? cfg.weights[3] ?? 0.5;
}

/** Each person can match only one person: keep the strongest pairs first. */
export function oneToOne(pairs: MatchedPair[], cfg: MergeConfig = mergeConfig): MatchedPair[] {
  const sorted = [...pairs].sort(
    (x, y) => y.similarity * pairWeight(y, cfg) - x.similarity * pairWeight(x, cfg) || (x.aId + x.bId < y.aId + y.bId ? -1 : 1),
  );
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  const out: MatchedPair[] = [];
  for (const p of sorted) {
    if (usedA.has(p.aId) || usedB.has(p.bId)) continue;
    usedA.add(p.aId);
    usedB.add(p.bId);
    out.push(p);
  }
  return out;
}

export function scorePairs(pairs: MatchedPair[], cfg: MergeConfig = mergeConfig): { score: number; band: Band } {
  const score = pairs.reduce((sum, p) => sum + p.similarity * pairWeight(p, cfg), 0);
  const band: Band = score >= cfg.bands.high ? "HIGH" : score >= cfg.bands.medium ? "MEDIUM" : "LOW";
  return { score: Math.round(score * 100) / 100, band };
}

/** Stable hash of the confirmed pair set, used to suppress repeat suggestions. */
export function fingerprint(pairs: MatchedPair[]): string {
  const ids = pairs.map((p) => `${p.aId}:${p.bId}`).sort().join("|");
  return createHash("sha256").update(ids).digest("hex").slice(0, 32);
}
