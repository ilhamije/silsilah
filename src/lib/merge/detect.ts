/*
 * Merge detection between two trees: candidate name pairs, structural
 * confirmation, scoring, and re-suggest suppression. Pure and synchronous;
 * loading trees and saving suggestions is the caller's job.
 */
import { createHash } from "node:crypto";
import { mergeConfig, type MergeConfig } from "./config";
import { nameSimilarity, type MatchPerson } from "./similarity";

export type MatchTree = {
  people: MatchPerson[];
  /** [parentId, childId] */
  parentChild: [string, string][];
  /** [personId, personId] */
  spouses: [string, string][];
};

export type Pair = { aId: string; bId: string; similarity: number };
export type ConfirmationKind = "common_ancestor" | "common_descendant" | "direct_line" | "spouse";
export type ConfirmedPair = Pair & { weight: number; kinds: ConfirmationKind[] };
export type Band = "HIGH" | "MEDIUM" | "LOW";

export type Detection = {
  confirmed: ConfirmedPair[];
  score: number;
  band: Band;
  fingerprint: string;
};

const key = (p: { aId: string; bId: string }) => `${p.aId}|${p.bId}`;

class Graph {
  private parents = new Map<string, string[]>();
  private children = new Map<string, string[]>();
  private spouse = new Set<string>();
  constructor(t: MatchTree) {
    for (const [p, c] of t.parentChild) {
      (this.parents.get(c) ?? this.parents.set(c, []).get(c)!).push(p);
      (this.children.get(p) ?? this.children.set(p, []).get(p)!).push(c);
    }
    for (const [x, y] of t.spouses) {
      this.spouse.add(`${x}|${y}`);
      this.spouse.add(`${y}|${x}`);
    }
  }
  /** id -> generations, breadth-first, shortest distance wins. */
  private walk(start: string, next: Map<string, string[]>, max: number) {
    const dist = new Map<string, number>();
    let frontier = [start];
    for (let d = 1; d <= max; d++) {
      const nf: string[] = [];
      for (const n of frontier) {
        for (const m of next.get(n) ?? []) {
          if (m === start || dist.has(m)) continue;
          dist.set(m, d);
          nf.push(m);
        }
      }
      frontier = nf;
    }
    return dist;
  }
  ancestors(id: string, max: number) {
    return this.walk(id, this.parents, max);
  }
  descendants(id: string, max: number) {
    return this.walk(id, this.children, max);
  }
  married(x: string, y: string) {
    return this.spouse.has(`${x}|${y}`);
  }
}

/** Candidate pairs above the name threshold, made one-to-one greedily. */
export function candidatePairs(a: MatchTree, b: MatchTree, cfg: MergeConfig): Pair[] {
  const all: Pair[] = [];
  for (const pa of a.people) {
    for (const pb of b.people) {
      const similarity = nameSimilarity(pa, pb, cfg);
      if (similarity > 0) all.push({ aId: pa.id, bId: pb.id, similarity });
    }
  }
  all.sort((x, y) => y.similarity - x.similarity);
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  const out: Pair[] = [];
  for (const p of all) {
    if (usedA.has(p.aId) || usedB.has(p.bId)) continue;
    usedA.add(p.aId);
    usedB.add(p.bId);
    out.push(p);
  }
  return out;
}

function weightFor(d: number, cfg: MergeConfig) {
  return d <= 1 ? cfg.weights.d1 : d === 2 ? cfg.weights.d2 : cfg.weights.d3;
}

export function detectMerge(a: MatchTree, b: MatchTree, overrides?: Partial<MergeConfig>): Detection | null {
  const cfg = mergeConfig(overrides);
  const pairs = candidatePairs(a, b, cfg);
  if (pairs.length < cfg.minConfirmedPairs) return null;

  const ga = new Graph(a);
  const gb = new Graph(b);
  const maxUp = Math.max(cfg.ancestorMaxDepth, cfg.directLinkMaxDepth);
  const maxDown = Math.max(cfg.descendantMaxDepth, cfg.directLinkMaxDepth);
  const upA = pairs.map((p) => ga.ancestors(p.aId, maxUp));
  const upB = pairs.map((p) => gb.ancestors(p.bId, maxUp));
  const downA = pairs.map((p) => ga.descendants(p.aId, maxDown));
  const downB = pairs.map((p) => gb.descendants(p.bId, maxDown));

  const confirmed = new Map<string, ConfirmedPair>();
  const confirm = (i: number, kind: ConfirmationKind, weight: number) => {
    const p = pairs[i];
    const cur = confirmed.get(key(p)) ?? { ...p, weight: 0, kinds: [] };
    cur.weight = Math.max(cur.weight, weight);
    if (!cur.kinds.includes(kind)) cur.kinds.push(kind);
    confirmed.set(key(p), cur);
  };

  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      // Direct line: i is an ancestor of j on both sides, same generations.
      for (const [x, y] of [[i, j], [j, i]]) {
        const da = upA[y].get(pairs[x].aId);
        const db = upB[y].get(pairs[x].bId);
        if (da && da === db && da <= cfg.directLinkMaxDepth) {
          const w = weightFor(da, cfg);
          confirm(x, "direct_line", w);
          confirm(y, "direct_line", w);
        }
      }
      if (cfg.allowSpouseLink && ga.married(pairs[i].aId, pairs[j].aId) && gb.married(pairs[i].bId, pairs[j].bId)) {
        confirm(i, "spouse", cfg.weights.spouse);
        confirm(j, "spouse", cfg.weights.spouse);
      }
      // Anchors: a third pair related to both i and j in the same way.
      for (let k = 0; k < pairs.length; k++) {
        if (k === i || k === j) continue;
        // x is an ancestor of both: distances must agree in A and B.
        const ai = upA[i].get(pairs[k].aId);
        const aj = upA[j].get(pairs[k].aId);
        const bi = upB[i].get(pairs[k].bId);
        const bj = upB[j].get(pairs[k].bId);
        if (ai && aj && ai === bi && aj === bj && ai <= cfg.ancestorMaxDepth && aj <= cfg.ancestorMaxDepth) {
          const w = weightFor(Math.min(ai, aj), cfg);
          confirm(i, "common_ancestor", w);
          confirm(j, "common_ancestor", w);
          confirm(k, "common_ancestor", w);
        }
        // x is a descendant of both.
        const di = downA[i].get(pairs[k].aId);
        const dj = downA[j].get(pairs[k].aId);
        const ei = downB[i].get(pairs[k].bId);
        const ej = downB[j].get(pairs[k].bId);
        if (di && dj && di === ei && dj === ej && di <= cfg.descendantMaxDepth && dj <= cfg.descendantMaxDepth) {
          const w = weightFor(Math.min(di, dj), cfg);
          confirm(i, "common_descendant", w);
          confirm(j, "common_descendant", w);
          confirm(k, "common_descendant", w);
        }
      }
    }
  }

  if (confirmed.size < cfg.minConfirmedPairs) return null;
  const list = [...confirmed.values()].sort((x, y) => key(x).localeCompare(key(y)));
  const score = list.reduce((s, p) => s + p.similarity * p.weight, 0);
  const band: Band = score >= cfg.bands.high ? "HIGH" : score >= cfg.bands.medium ? "MEDIUM" : "LOW";
  return { confirmed: list, score, band, fingerprint: fingerprint(list) };
}

export function fingerprint(pairs: { aId: string; bId: string }[]): string {
  const keys = pairs.map(key).sort().join(",");
  return createHash("sha256").update(keys).digest("hex").slice(0, 32);
}

const BAND_RANK: Record<Band, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/**
 * After a rejection, the same trees are suggested again only when the new
 * confirmed set adds enough pairs, or the band goes up.
 */
export function shouldResuggest(
  rejected: { pairs: { aId: string; bId: string }[]; band: Band },
  next: Detection,
  overrides?: Partial<MergeConfig>,
): boolean {
  const cfg = mergeConfig(overrides);
  const old = new Set(rejected.pairs.map(key));
  const added = next.confirmed.filter((p) => !old.has(key(p))).length;
  return added >= cfg.resuggestMinNewPairs || BAND_RANK[next.band] > BAND_RANK[rejected.band];
}
