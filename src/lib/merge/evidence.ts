import type { ConfirmKind, MatchedPair, MergeTree } from "./types";

/** One matched pair in words the UI can translate: names plus why they matched. */
export type EvidenceLine = {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  aYear: number | null;
  bYear: number | null;
  kinds: ConfirmKind[];
};

export function buildEvidence(a: MergeTree, b: MergeTree, pairs: MatchedPair[]): EvidenceLine[] {
  const pa = new Map(a.people.map((p) => [p.id, p]));
  const pb = new Map(b.people.map((p) => [p.id, p]));
  return pairs.map((p) => {
    const x = pa.get(p.aId)!;
    const y = pb.get(p.bId)!;
    return {
      aId: p.aId,
      bId: p.bId,
      aName: x.fullName,
      bName: y.fullName,
      aYear: x.birthYear,
      bYear: y.birthYear,
      kinds: p.kinds,
    };
  });
}
