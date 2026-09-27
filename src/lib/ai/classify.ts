import type { Extraction } from "./schema";

/** Tunable thresholds for deciding when a page needs the user's attention. */
export const extractionThresholds = {
  /** Overall confidence below this is "borderline": warn, don't silently reject. */
  borderlineConfidence: 0.5,
  /** Field or relationship confidence below this is highlighted for review. */
  reviewFieldConfidence: 0.7,
  /** Share of illegible names above which the page is borderline. */
  maxIllegibleShare: 0.5,
} as const;

export type BorderlineReason = "low_confidence" | "no_people" | "no_relationships" | "mostly_illegible";

export type PageVerdict =
  | { kind: "ok" }
  | { kind: "rejected"; reason: string | null }
  | { kind: "borderline"; reasons: BorderlineReason[] };

export function classifyExtraction(e: Extraction): PageVerdict {
  if (!e.is_family_tree) return { kind: "rejected", reason: e.rejection_reason };
  const reasons: BorderlineReason[] = [];
  if (e.people.length === 0) reasons.push("no_people");
  else {
    if (e.relationships.length === 0 && e.people.length > 1) reasons.push("no_relationships");
    const illegible = e.people.filter((p) => p.illegible).length;
    if (illegible / e.people.length > extractionThresholds.maxIllegibleShare) reasons.push("mostly_illegible");
  }
  if (e.confidence < extractionThresholds.borderlineConfidence) reasons.push("low_confidence");
  return reasons.length ? { kind: "borderline", reasons } : { kind: "ok" };
}
