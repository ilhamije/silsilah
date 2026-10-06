import type { Db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { mergeConfig, type MergeConfig } from "./config";
import { loadMergeTree } from "./load";
import { matchTrees, type MatchResult } from "./index";

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const BAND_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;

/** Trees to compare with: ones the owner of this tree edits too, plus opted-in strangers. */
async function candidateTrees(db: Db, treeId: string, allowCross: boolean) {
  const mine = await db.treeMember.findMany({
    where: { treeId, role: { in: ["OWNER", "EDITOR"] } },
    select: { userId: true },
  });
  const sameUser = await db.familyTree.findMany({
    where: {
      id: { not: treeId },
      members: { some: { userId: { in: mine.map((m) => m.userId) }, role: { in: ["OWNER", "EDITOR"] } } },
    },
    select: { id: true },
  });
  const ids = new Map<string, boolean>(sameUser.map((t) => [t.id, false]));
  if (allowCross) {
    const keys = await db.person.findMany({
      where: { treeId, deletedAt: null, nameKey: { not: "" } },
      select: { nameKey: true },
      distinct: ["nameKey"],
    });
    const strangers = await db.familyTree.findMany({
      where: {
        id: { not: treeId },
        allowCrossFamilyMatch: true,
        people: { some: { deletedAt: null, nameKey: { in: keys.map((k) => k.nameKey) } } },
      },
      select: { id: true },
    });
    for (const t of strangers) if (!ids.has(t.id)) ids.set(t.id, true);
  }
  return ids;
}

/** Pairs already linked (and not undone) don't need suggesting again. */
async function withoutLinked(db: Db, r: MatchResult, treeAId: string, treeBId: string): Promise<MatchResult | null> {
  const links = await db.personLink.findMany({
    where: { treeAId, treeBId, removedAt: null },
    select: { personAId: true, personBId: true },
  });
  if (!links.length) return r;
  const linked = new Set(links.map((l) => `${l.personAId}:${l.personBId}`));
  const pairs = r.pairs.filter((p) => !linked.has(`${p.aId}:${p.bId}`));
  return pairs.length < r.pairs.length && pairs.length < mergeConfig.minConfirmedPairs ? null : r;
}

/**
 * Compares one tree with every candidate tree and stores suggestions. Safe to
 * run any number of times: unchanged results create nothing, and a rejected
 * suggestion comes back only when enough new evidence has appeared.
 */
export async function detectMerges(
  db: Db,
  treeId: string,
  opts: { userId?: string | null; cfg?: MergeConfig } = {},
) {
  const cfg = opts.cfg ?? mergeConfig;
  const tree = await db.familyTree.findUnique({
    where: { id: treeId },
    select: { id: true, allowCrossFamilyMatch: true, structureVersion: true },
  });
  if (!tree) return { created: 0 };
  const others = await candidateTrees(db, treeId, tree.allowCrossFamilyMatch);
  const mine = await loadMergeTree(db, treeId);
  let created = 0;

  for (const [otherId, crossFamily] of others) {
    const other = await db.familyTree.findUnique({
      where: { id: otherId },
      select: { structureVersion: true },
    });
    if (!other) continue;
    // Stored order: treeA < treeB, so each pair of trees has one row per detection.
    const swap = treeId > otherId;
    const [aTree, bTree] = swap ? [await loadMergeTree(db, otherId), mine] : [mine, await loadMergeTree(db, otherId)];
    const found = matchTrees(aTree, bTree, cfg);
    const result = found ? await withoutLinked(db, found, aTree.id, bTree.id) : null;
    const where = { treeAId: aTree.id, treeBId: bTree.id };

    if (!result) {
      await db.mergeSuggestion.updateMany({
        where: { ...where, status: "PENDING" },
        data: { status: "SUPERSEDED" },
      });
      continue;
    }
    const pending = await db.mergeSuggestion.findFirst({
      where: { ...where, status: { in: ["PENDING", "REVIEWING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (pending?.fingerprint === result.fingerprint) continue;

    const rejected = await db.mergeSuggestion.findFirst({
      where: { ...where, status: "REJECTED" },
      orderBy: { createdAt: "desc" },
    });
    if (rejected) {
      const old = new Set((rejected.matchedPairs as { aId: string; bId: string }[]).map((p) => `${p.aId}:${p.bId}`));
      const fresh = result.pairs.filter((p) => !old.has(`${p.aId}:${p.bId}`)).length;
      const higher = BAND_RANK[result.band] > BAND_RANK[rejected.band];
      if (rejected.fingerprint === result.fingerprint || (fresh < cfg.resuggestMinNewPairs && !higher)) continue;
    }

    await db.$transaction(async (tx) => {
      await tx.mergeSuggestion.updateMany({
        where: { ...where, status: "PENDING" },
        data: { status: "SUPERSEDED" },
      });
      const s = await tx.mergeSuggestion.create({
        data: {
          ...where,
          matchedPairs: json(result.pairs),
          evidence: json({ requesterTreeId: treeId, lines: result.evidence }),
          score: result.score,
          band: result.band,
          crossFamily,
          fingerprint: result.fingerprint,
          treeAVersion: swap ? other.structureVersion : tree.structureVersion,
          treeBVersion: swap ? tree.structureVersion : other.structureVersion,
          configSnapshot: json(cfg),
        },
      });
      if (crossFamily) {
        await tx.connectionRequest.create({
          data: {
            fromTreeId: treeId,
            toTreeId: otherId,
            mergeSuggestionId: s.id,
            requestedById:
              opts.userId ??
              (await tx.treeMember.findFirst({ where: { treeId, role: "OWNER" }, select: { userId: true } }))?.userId ??
              "",
          },
        });
      }
    });
    created++;
  }
  return { created };
}
