import type { Db } from "@/lib/db";
import type { Gender } from "@/generated/prisma/enums";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { notFound } from "@/lib/errors";
import { treatAsLiving } from "@/lib/tree/living";
import type { ConfirmKind } from "./types";
import { MERGE_FIELDS } from "./apply";

export type PersonView = {
  id: string;
  fullName: string;
  gender: Gender;
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  notes: string | null;
};

export type PairView = {
  aId: string;
  bId: string;
  kinds: ConfirmKind[];
  a: PersonView | null;
  b: PersonView | null;
};

/** What the merge page may show. Across families, the other tree stays hidden until its owners accept. */
export type ReviewData = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "REVIEWING" | "SUPERSEDED";
  band: "HIGH" | "MEDIUM" | "LOW";
  score: number;
  crossFamily: boolean;
  /** The tree the viewer came from, and the other one (name null while hidden). */
  treeA: { id: string; name: string | null; canDecide: boolean };
  treeB: { id: string; name: string | null; canDecide: boolean };
  /** none: all visible. requester: only the number of matches. responder: only your own side. */
  hidden: "none" | "requester" | "responder";
  pairCount: number;
  pairs: PairView[];
  /** Set for the other family's editors while the request is waiting. */
  pendingRequestId: string | null;
  /** The accepted operation that can still be undone. */
  operationId: string | null;
  fields: typeof MERGE_FIELDS;
};

const PERSON_SELECT = {
  id: true, fullName: true, gender: true, birthDate: true, deathDate: true, birthPlace: true, notes: true, isLiving: true,
} as const;

type Row = PersonView & { isLiving: boolean | null };

const view = (r: Row | undefined, hideLiving: boolean): PersonView | null => {
  if (!r) return null;
  const { isLiving, ...rest } = r;
  if (hideLiving && treatAsLiving(isLiving)) return { ...rest, birthDate: null, deathDate: null, birthPlace: null, notes: null };
  return rest;
};

export async function getReview(db: Db, userId: string, suggestionId: string): Promise<ReviewData> {
  const s = await db.mergeSuggestion.findUnique({
    where: { id: suggestionId },
    include: {
      treeA: { select: { id: true, name: true } },
      treeB: { select: { id: true, name: true } },
      requests: true,
      operations: { where: { undoneAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!s) throw notFound("suggestion_not_found");
  const can = (treeId: string) => assertTreePermission(db, userId, treeId, "merge.decide").then(() => true, () => false);
  const [canA, canB] = await Promise.all([can(s.treeAId), can(s.treeBId)]);
  if (!canA && !canB) throw notFound("suggestion_not_found");

  const accepted = s.requests.some((r) => r.status === "ACCEPTED");
  const visible = !s.crossFamily || accepted;
  const requesterTreeId = (s.evidence as { requesterTreeId?: string }).requesterTreeId;
  const matched = s.matchedPairs as { aId: string; bId: string; kinds: ConfirmKind[] }[];
  const hidden: ReviewData["hidden"] = visible ? "none" : canA && s.treeAId === requesterTreeId || canB && s.treeBId === requesterTreeId ? "requester" : "responder";

  let pairs: PairView[] = [];
  if (hidden !== "requester") {
    const [pa, pb] = await Promise.all([
      canA || visible ? db.person.findMany({ where: { id: { in: matched.map((p) => p.aId) }, deletedAt: null }, select: PERSON_SELECT }) : [],
      canB || visible ? db.person.findMany({ where: { id: { in: matched.map((p) => p.bId) }, deletedAt: null }, select: PERSON_SELECT }) : [],
    ]);
    const mapA = new Map(pa.map((p) => [p.id, p]));
    const mapB = new Map(pb.map((p) => [p.id, p]));
    pairs = matched.map((p) => ({
      aId: p.aId,
      bId: p.bId,
      kinds: p.kinds,
      // The other family's living people never show details, only names.
      a: view(mapA.get(p.aId), s.crossFamily && !canA),
      b: view(mapB.get(p.bId), s.crossFamily && !canB),
    }));
  }
  const pending = s.requests.find((r) => r.status === "PENDING");
  return {
    id: s.id,
    status: s.status,
    band: s.band,
    score: s.score,
    crossFamily: s.crossFamily,
    treeA: { id: s.treeA.id, name: visible || canA ? s.treeA.name : null, canDecide: canA },
    treeB: { id: s.treeB.id, name: visible || canB ? s.treeB.name : null, canDecide: canB },
    hidden,
    pairCount: matched.length,
    pairs,
    pendingRequestId: pending && pending.toTreeId !== requesterTreeId && (pending.toTreeId === s.treeAId ? canA : canB) ? pending.id : null,
    operationId: s.status === "ACCEPTED" ? (s.operations[0]?.id ?? null) : null,
    fields: MERGE_FIELDS,
  };
}

export type OverviewItem = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REVIEWING";
  band: "HIGH" | "MEDIUM" | "LOW";
  crossFamily: boolean;
  otherTreeName: string | null;
  pairCount: number;
  awaitingYou: boolean;
};

/** Suggestions involving this tree, for the list page and the "N possible matches" banner. */
export async function listMerges(db: Db, userId: string, treeId: string): Promise<OverviewItem[]> {
  await assertTreePermission(db, userId, treeId, "merge.decide");
  const rows = await db.mergeSuggestion.findMany({
    where: { status: { in: ["PENDING", "REVIEWING", "ACCEPTED"] }, OR: [{ treeAId: treeId }, { treeBId: treeId }] },
    orderBy: { createdAt: "desc" },
    include: { treeA: { select: { id: true, name: true } }, treeB: { select: { id: true, name: true } }, requests: true },
  });
  return rows.map((s) => {
    const other = s.treeAId === treeId ? s.treeB : s.treeA;
    const visible = !s.crossFamily || s.requests.some((r) => r.status === "ACCEPTED");
    return {
      id: s.id,
      status: s.status as OverviewItem["status"],
      band: s.band,
      crossFamily: s.crossFamily,
      otherTreeName: visible ? other.name : null,
      pairCount: (s.matchedPairs as unknown[]).length,
      awaitingYou: s.requests.some((r) => r.status === "PENDING" && r.toTreeId === treeId),
    };
  });
}

/** Active links involving this tree, so people can be unlinked later. */
export async function listLinks(db: Db, userId: string, treeId: string) {
  await assertTreePermission(db, userId, treeId, "merge.decide");
  const links = await db.personLink.findMany({
    where: { removedAt: null, OR: [{ treeAId: treeId }, { treeBId: treeId }] },
    include: {
      personA: { select: { fullName: true } },
      personB: { select: { fullName: true } },
      treeA: { select: { name: true } },
      treeB: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return links.map((l) => {
    const mineIsA = l.treeAId === treeId;
    return {
      id: l.id,
      mine: mineIsA ? l.personA.fullName : l.personB.fullName,
      theirs: mineIsA ? l.personB.fullName : l.personA.fullName,
      otherTree: mineIsA ? l.treeB.name : l.treeA.name,
    };
  });
}
