import { mergeConfig, type MergeConfig } from "./config";
import { findCandidates } from "./candidates";
import { confirmPairs } from "./structure";
import { fingerprint, oneToOne, scorePairs, type Band } from "./score";
import { buildEvidence, type EvidenceLine } from "./evidence";
import type { MatchedPair, MergeTree } from "./types";

export type MatchResult = {
  pairs: MatchedPair[];
  score: number;
  band: Band;
  fingerprint: string;
  evidence: EvidenceLine[];
};

/** Pure matcher: two trees in, a suggestion (or null) out. No database. */
export function matchTrees(a: MergeTree, b: MergeTree, cfg: MergeConfig = mergeConfig): MatchResult | null {
  const candidates = findCandidates(a, b, cfg);
  if (candidates.length < cfg.minConfirmedPairs) return null;
  const pairs = oneToOne(confirmPairs(a, b, candidates, cfg), cfg);
  if (pairs.length < cfg.minConfirmedPairs) return null;
  const { score, band } = scorePairs(pairs, cfg);
  return { pairs, score, band, fingerprint: fingerprint(pairs), evidence: buildEvidence(a, b, pairs) };
}

export { mergeConfig } from "./config";
export type { MergeTree, MergePerson, MatchedPair } from "./types";
