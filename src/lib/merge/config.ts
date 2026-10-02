/*
 * Tunable knobs for merge detection. Everything the admin tuning page and
 * scripts/tune-merge.ts may change lives here; a snapshot is stored with each
 * suggestion so old decisions can be explained later.
 */
export type MergeConfig = {
  nameSimilarity: number; // Jaro-Winkler threshold for a name match
  maxBirthYearGap: number; // hard conflict beyond this many years
  minConfirmedPairs: number; // pairs needed before a suggestion is made
  ancestorMaxDepth: number; // common ancestor distance (1 = parent)
  descendantMaxDepth: number; // common descendant distance
  directLinkMaxDepth: number; // matched parent/grandparent + child; 0 = off
  allowSpouseLink: boolean; // matched spouses count as structure (weak)
  weights: { d1: number; d2: number; d3: number; spouse: number };
  bands: { high: number; medium: number };
  resuggestMinNewPairs: number; // after a rejection
};

export const DEFAULT_MERGE_CONFIG: MergeConfig = {
  nameSimilarity: 0.88,
  maxBirthYearGap: 5,
  minConfirmedPairs: 2,
  ancestorMaxDepth: 3,
  descendantMaxDepth: 2,
  directLinkMaxDepth: 2,
  allowSpouseLink: false,
  weights: { d1: 1, d2: 0.7, d3: 0.5, spouse: 0.6 },
  bands: { high: 4, medium: 2.5 },
  resuggestMinNewPairs: 2,
};

export function mergeConfig(overrides?: Partial<MergeConfig>): MergeConfig {
  return { ...DEFAULT_MERGE_CONFIG, ...overrides };
}
