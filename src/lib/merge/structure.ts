import { mergeConfig, type MergeConfig } from "./config";
import type { Candidate } from "./candidates";
import type { ConfirmKind, MatchedPair, MergeTree } from "./types";

type Adj = Map<string, string[]>;

function adjacency(edges: [string, string][], flip = false): Adj {
  const m: Adj = new Map();
  for (const [p, c] of edges) {
    const [from, to] = flip ? [c, p] : [p, c];
    if (!m.has(from)) m.set(from, []);
    m.get(from)!.push(to);
  }
  return m;
}

/** Everyone reachable within maxDepth steps, with the shortest distance. */
function reach(adj: Adj, start: string, maxDepth: number): Map<string, number> {
  const dist = new Map<string, number>();
  let frontier = [start];
  for (let d = 1; d <= maxDepth; d++) {
    const next: string[] = [];
    for (const n of frontier) {
      for (const m of adj.get(n) ?? []) {
        if (m === start || dist.has(m)) continue;
        dist.set(m, d);
        next.push(m);
      }
    }
    frontier = next;
  }
  return dist;
}

type Link = { kind: ConfirmKind; distance: number; withKey: string };

/**
 * Structural confirmation. A candidate pair is confirmed when another pair
 * (with different people on both sides) is connected to it in the same way in
 * both trees. Returns only the confirmed pairs, with what confirmed them.
 */
export function confirmPairs(
  a: MergeTree,
  b: MergeTree,
  candidates: Candidate[],
  cfg: MergeConfig = mergeConfig,
): MatchedPair[] {
  const key = (c: Candidate) => `${c.a.id}:${c.b.id}`;
  const links = new Map<string, Link[]>();
  const add = (c: Candidate, l: Link) => {
    const k = key(c);
    if (!links.has(k)) links.set(k, []);
    links.get(k)!.push(l);
  };
  const distinct = (p: Candidate, q: Candidate) => p.a.id !== q.a.id && p.b.id !== q.b.id;

  const downA = adjacency(a.parentChild);
  const downB = adjacency(b.parentChild);
  const upA = adjacency(a.parentChild, true);
  const upB = adjacency(b.parentChild, true);

  const byA = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (!byA.has(c.a.id)) byA.set(c.a.id, []);
    byA.get(c.a.id)!.push(c);
  }

  // For an anchor (x,y), the pairs below (or above) it at equal distance.
  const anchored = (c: Candidate, downward: boolean, maxDist: number) => {
    const reachA = reach(downward ? downA : upA, c.a.id, maxDist);
    const reachB = reach(downward ? downB : upB, c.b.id, maxDist);
    const group: { pair: Candidate; d: number }[] = [];
    for (const [aId, d] of reachA) {
      for (const p of byA.get(aId) ?? []) {
        if (p.b.id !== c.b.id && reachB.get(p.b.id) === d) group.push({ pair: p, d });
      }
    }
    return group;
  };

  for (const anchor of candidates) {
    for (const [downward, maxDist, kind] of [
      [true, cfg.maxAncestorDistance, "ancestor"],
      [false, cfg.maxDescendantDistance, "descendant"],
    ] as const) {
      const group = anchored(anchor, downward, maxDist);
      // Two members of the group with distinct people on both sides confirm each other and the anchor.
      const confirmed = group.filter((g) => group.some((h) => h !== g && distinct(g.pair, h.pair)));
      if (!confirmed.length) continue;
      for (const g of confirmed) {
        add(g.pair, { kind, distance: g.d, withKey: key(anchor) });
      }
      add(anchor, { kind, distance: Math.min(...confirmed.map((g) => g.d)), withKey: key(confirmed[0].pair) });
    }

    // Direct line: matched parent/grandparent and child, in the same direction in both trees.
    if (cfg.directLinkMaxDepth > 0) {
      const reachA = reach(downA, anchor.a.id, cfg.directLinkMaxDepth);
      const reachB = reach(downB, anchor.b.id, cfg.directLinkMaxDepth);
      for (const [aId, d] of reachA) {
        for (const p of byA.get(aId) ?? []) {
          if (!distinct(anchor, p) || reachB.get(p.b.id) !== d) continue;
          add(anchor, { kind: "direct", distance: d, withKey: key(p) });
          add(p, { kind: "direct", distance: d, withKey: key(anchor) });
        }
      }
    }
  }

  if (cfg.allowSpouseLink) {
    const marriedA = new Set(a.spouses.map(([x, y]) => [x, y].sort().join("|")));
    const marriedB = new Set(b.spouses.map(([x, y]) => [x, y].sort().join("|")));
    for (const p of candidates) {
      for (const q of candidates) {
        if (key(p) >= key(q) || !distinct(p, q)) continue;
        if (marriedA.has([p.a.id, q.a.id].sort().join("|")) && marriedB.has([p.b.id, q.b.id].sort().join("|"))) {
          add(p, { kind: "spouse", distance: 0, withKey: key(q) });
          add(q, { kind: "spouse", distance: 0, withKey: key(p) });
        }
      }
    }
  }

  const out: MatchedPair[] = [];
  for (const c of candidates) {
    const ls = links.get(key(c));
    if (!ls) continue;
    out.push({
      aId: c.a.id,
      bId: c.b.id,
      similarity: c.similarity,
      kinds: [...new Set(ls.map((l) => l.kind))],
      // Closest generational link; 0 only when a spouse link is all there is.
      distance: Math.min(...ls.filter((l) => l.kind !== "spouse").map((l) => l.distance), ...(ls.every((l) => l.kind === "spouse") ? [0] : [])),
      confirmedBy: [...new Set(ls.map((l) => l.withKey))],
    });
  }
  return out;
}
