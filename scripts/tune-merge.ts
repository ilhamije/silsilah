/*
 * Re-runs merge matching over the fixture trees with config variants, so
 * thresholds can be tuned without a database:
 *
 *   npx tsx scripts/tune-merge.ts
 *
 * Add a variant below, run, and compare matches and bands. Expectations: A and
 * B overlap (should match), C only shares names with A (should not).
 */
import { readFileSync } from "node:fs";
import { matchTrees, mergeConfig, type MergeTree } from "../src/lib/merge";

const load = (n: string) => JSON.parse(readFileSync(`fixtures/trees/${n}.json`, "utf8")) as MergeTree;
const [a, b, c] = ["overlap-a", "overlap-b", "decoy-c"].map(load);

const variants = {
  default: {},
  "strict names (0.94)": { nameSimilarity: 0.94 },
  "loose names (0.82)": { nameSimilarity: 0.82 },
  "no direct line": { directLinkMaxDepth: 0 },
  "spouse links on": { allowSpouseLink: true },
  "3 confirmed pairs": { minConfirmedPairs: 3 },
};

for (const [label, patch] of Object.entries(variants)) {
  const cfg = { ...mergeConfig, ...patch };
  console.log(`\n== ${label}`);
  for (const [name, x, y] of [["A vs B (should match)", a, b], ["A vs C (decoy)", a, c]] as const) {
    const r = matchTrees(x, y, cfg);
    console.log(
      `${name.padEnd(24)}`,
      r ? `${r.pairs.length} pairs, score ${r.score}, ${r.band}` : "no suggestion",
    );
  }
}
