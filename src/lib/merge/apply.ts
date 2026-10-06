import { z } from "zod";
import type { Db } from "@/lib/db";
import type { Person, Prisma } from "@/generated/prisma/client";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { logActivity, touchTree } from "@/lib/activity";
import { badRequest, notFound } from "@/lib/errors";
import { personDataFromFields } from "@/lib/people";

/** Fields the user can pick a winner for when two linked people disagree. */
export const MERGE_FIELDS = ["fullName", "gender", "birthDate", "deathDate", "birthPlace", "notes"] as const;
type MergeField = (typeof MERGE_FIELDS)[number];

/** Every column a field choice can change, including derived ones, so undo restores them exactly. */
const SNAPSHOT_COLUMNS = [
  "fullName", "givenName", "familyName", "gender", "birthDate", "birthYear", "deathDate", "deathYear",
  "birthPlace", "notes", "isLiving", "livingIsManual", "nameKey",
] as const;

type Pair = { aId: string; bId: string };
const pairKey = (p: Pair) => `${p.aId}:${p.bId}`;

export const acceptInputSchema = z.object({
  /** "aId:bId" for each matched pair the user keeps. */
  keep: z.array(z.string()).min(1),
  /** Per kept pair, which side's value wins for a conflicting field. */
  choices: z.record(z.string(), z.partialRecord(z.enum(MERGE_FIELDS), z.enum(["a", "b"]))).default({}),
});
export type AcceptInput = z.input<typeof acceptInputSchema>;

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

async function loadSuggestion(db: Db, id: string) {
  const s = await db.mergeSuggestion.findUnique({ where: { id }, include: { requests: true } });
  if (!s) throw notFound("suggestion_not_found");
  return s;
}

/** Same-family: the caller edits both trees. Cross-family: an accepted request and edit rights on one side. */
async function assertCanDecide(db: Db, userId: string, s: Awaited<ReturnType<typeof loadSuggestion>>) {
  const [a, b] = await Promise.all([
    assertTreePermission(db, userId, s.treeAId, "merge.decide").then(() => true, () => false),
    assertTreePermission(db, userId, s.treeBId, "merge.decide").then(() => true, () => false),
  ]);
  if (!s.crossFamily) {
    if (!a || !b) throw notFound("suggestion_not_found");
    return;
  }
  if (!a && !b) throw notFound("suggestion_not_found");
  if (!s.requests.some((r) => r.status === "ACCEPTED")) throw badRequest("connection_not_accepted");
}

function outcomeRow(s: { id: string; score: number; band: "HIGH" | "MEDIUM" | "LOW"; matchedPairs: unknown }, outcome: string) {
  const pairs = s.matchedPairs as { similarity: number; kinds: string[] }[];
  return {
    suggestionId: s.id,
    outcome,
    score: s.score,
    band: s.band,
    similarities: json(pairs.map((p) => p.similarity)),
    matchKinds: [...new Set(pairs.flatMap((p) => p.kinds))],
  };
}

/**
 * Accepting links the matched people; both trees stay as they are. Conflicting
 * fields take the side the user picked, written to both people. Everything
 * changed is snapshotted so the operation can be undone exactly.
 */
export async function acceptSuggestion(db: Db, userId: string, suggestionId: string, input: unknown) {
  const parsed = acceptInputSchema.safeParse(input);
  if (!parsed.success) throw badRequest("invalid_merge", parsed.error.issues);
  const s = await loadSuggestion(db, suggestionId);
  await assertCanDecide(db, userId, s);
  if (s.status !== "PENDING" && s.status !== "REVIEWING") throw badRequest("suggestion_closed");

  const matched = s.matchedPairs as Pair[];
  const known = new Map(matched.map((p) => [pairKey(p), p]));
  const kept = parsed.data.keep.map((k) => known.get(k) ?? null);
  if (kept.some((k) => !k)) throw badRequest("unknown_pair");
  const pairs = kept as Pair[];
  // Cross-family trees are owned by different people, so values are never rewritten across them.
  if (s.crossFamily && Object.keys(parsed.data.choices).length) throw badRequest("no_field_choices_across_families");

  return db.$transaction(async (tx) => {
    const op = await tx.mergeOperation.create({
      data: { suggestionId: s.id, performedById: userId, fieldChoices: json(parsed.data.choices), before: [] },
    });
    const before: { personId: string; treeId: string; columns: Record<string, unknown>; afterVersion: number }[] = [];

    for (const pair of pairs) {
      const [pa, pb] = await Promise.all([
        tx.person.findFirst({ where: { id: pair.aId, treeId: s.treeAId, deletedAt: null } }),
        tx.person.findFirst({ where: { id: pair.bId, treeId: s.treeBId, deletedAt: null } }),
      ]);
      if (!pa || !pb) throw badRequest("person_changed");

      const existing = await tx.personLink.findUnique({ where: { personAId_personBId: { personAId: pa.id, personBId: pb.id } } });
      const linkData = { treeAId: s.treeAId, treeBId: s.treeBId, suggestionId: s.id, operationId: op.id, createdById: userId, removedAt: null, createdAt: new Date() };
      if (existing) await tx.personLink.update({ where: { id: existing.id }, data: linkData });
      else await tx.personLink.create({ data: { ...linkData, personAId: pa.id, personBId: pb.id } });

      const picks = parsed.data.choices[pairKey(pair)] ?? {};
      for (const [field, side] of Object.entries(picks) as [MergeField, "a" | "b"][]) {
        const winner = side === "a" ? pa : pb;
        for (const target of [pa, pb]) {
          if (target.id === winner.id || JSON.stringify(target[field]) === JSON.stringify(winner[field])) continue;
          const rec = before.find((b) => b.personId === target.id);
          const snapshot = rec ?? { personId: target.id, treeId: target.treeId, columns: pickColumns(target), afterVersion: 0 };
          if (!rec) before.push(snapshot);
          const data = personDataFromFields({
            fullName: target.fullName, givenName: target.givenName, familyName: target.familyName, nicknames: target.nicknames,
            gender: target.gender, birthDate: target.birthDate, deathDate: target.deathDate, birthPlace: target.birthPlace,
            notes: target.notes, livingOverride: target.livingIsManual ? target.isLiving : null,
            [field]: winner[field],
          });
          const updated = await tx.person.update({
            where: { id: target.id },
            data: { ...data, version: { increment: 1 }, updatedById: userId },
          });
          snapshot.afterVersion = updated.version;
          // Keep later picks on the same person working from the new values.
          Object.assign(target, updated);
        }
      }
    }

    await tx.mergeOperation.update({ where: { id: op.id }, data: { before: json(before) } });
    await tx.mergeSuggestion.update({ where: { id: s.id }, data: { status: "ACCEPTED", decidedAt: new Date(), decidedById: userId } });
    await tx.mergeOutcome.create({ data: outcomeRow(s, pairs.length < matched.length ? "reviewed" : "accepted") });
    for (const treeId of [s.treeAId, s.treeBId]) {
      const mine = await tx.treeMember.findUnique({ where: { treeId_userId: { treeId, userId } }, select: { userId: true } });
      if (!mine) continue; // cross-family: only log in a tree the user belongs to
      await logActivity(tx, { treeId, userId, action: "merged", entityType: "suggestion", entityId: s.id, after: { linked: pairs.length } });
      await touchTree(tx, treeId, userId, false);
    }
    return { operationId: op.id, linked: pairs.length };
  });
}

function pickColumns(p: Person) {
  return Object.fromEntries(SNAPSHOT_COLUMNS.map((c) => [c, p[c]]));
}

export async function rejectSuggestion(db: Db, userId: string, suggestionId: string) {
  const s = await loadSuggestion(db, suggestionId);
  await assertCanDecide(db, userId, s).catch((e) => {
    // A cross-family request can be refused before it is accepted.
    if (!(s.crossFamily && e instanceof Error && e.message === "connection_not_accepted")) throw e;
  });
  if (s.status !== "PENDING" && s.status !== "REVIEWING") throw badRequest("suggestion_closed");
  await db.$transaction([
    db.mergeSuggestion.update({ where: { id: s.id }, data: { status: "REJECTED", decidedAt: new Date(), decidedById: userId } }),
    db.mergeOutcome.create({ data: outcomeRow(s, "rejected") }),
  ]);
}

/**
 * Removes the links an operation created and restores any values it changed,
 * unless the person was edited again since (then that edit is kept).
 */
export async function undoOperation(db: Db, userId: string, operationId: string) {
  const op = await db.mergeOperation.findUnique({ where: { id: operationId }, include: { suggestion: true } });
  if (!op?.suggestion) throw notFound("operation_not_found");
  const s = await loadSuggestion(db, op.suggestion.id);
  await assertCanDecide(db, userId, s);
  if (op.undoneAt) throw badRequest("already_undone");

  const before = op.before as { personId: string; columns: Prisma.PersonUpdateInput; afterVersion: number }[];
  return db.$transaction(async (tx) => {
    let restored = 0;
    let kept = 0;
    for (const b of before) {
      const { count } = await tx.person.updateMany({
        where: { id: b.personId, version: b.afterVersion },
        data: { ...(b.columns as Prisma.PersonUpdateManyMutationInput), version: { increment: 1 }, updatedById: userId },
      });
      if (count) restored++;
      else kept++;
    }
    await tx.personLink.updateMany({ where: { operationId: op.id, removedAt: null }, data: { removedAt: new Date() } });
    await tx.mergeOperation.update({ where: { id: op.id }, data: { undoneAt: new Date(), undoneById: userId } });
    await tx.mergeSuggestion.update({ where: { id: s.id }, data: { status: "PENDING", decidedAt: null, decidedById: null } });
    await tx.mergeOutcome.create({ data: outcomeRow(s, "undone") });
    for (const treeId of [s.treeAId, s.treeBId]) {
      const mine = await tx.treeMember.findUnique({ where: { treeId_userId: { treeId, userId } }, select: { userId: true } });
      if (mine) await logActivity(tx, { treeId, userId, action: "unmerged", entityType: "suggestion", entityId: s.id });
    }
    return { restored, keptNewerEdits: kept };
  });
}

/** Removes one link without touching any values. */
export async function unlinkPair(db: Db, userId: string, linkId: string) {
  const link = await db.personLink.findUnique({ where: { id: linkId } });
  if (!link || link.removedAt) throw notFound("link_not_found");
  const [a, b] = await Promise.all([
    assertTreePermission(db, userId, link.treeAId, "merge.decide").then(() => true, () => false),
    assertTreePermission(db, userId, link.treeBId, "merge.decide").then(() => true, () => false),
  ]);
  if (!a && !b) throw notFound("link_not_found");
  await db.personLink.update({ where: { id: link.id }, data: { removedAt: new Date() } });
}

/** The other family's editors answer a cross-family request. Accepting only unlocks the link step. */
export async function respondToConnection(db: Db, userId: string, requestId: string, accept: boolean) {
  const req = await db.connectionRequest.findUnique({ where: { id: requestId } });
  if (!req) throw notFound("request_not_found");
  await assertTreePermission(db, userId, req.toTreeId, "merge.decide");
  if (req.status !== "PENDING") throw badRequest("request_closed");
  await db.$transaction([
    db.connectionRequest.update({
      where: { id: req.id },
      data: { status: accept ? "ACCEPTED" : "DECLINED", respondedById: userId, respondedAt: new Date() },
    }),
    ...(accept
      ? []
      : [db.mergeSuggestion.update({ where: { id: req.mergeSuggestionId }, data: { status: "REJECTED", decidedAt: new Date(), decidedById: userId } })]),
  ]);
}
