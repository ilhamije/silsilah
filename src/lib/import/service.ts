import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { logActivity, touchTree } from "@/lib/activity";
import { badRequest } from "@/lib/errors";
import { personDataFromFields } from "@/lib/people";
import { liveRelationshipsWhere } from "@/lib/relationships";
import { checkGraph, type Edge } from "@/lib/tree/graph";
import { importPayloadSchema } from "./schema";

export type ImportResult = {
  people: number; // newly created
  linked: number; // matched to people already in the tree
  relationships: number; // newly created
  pages: number;
  alreadyImported: boolean;
};

/**
 * Saves a confirmed review. The only place extracted data becomes Person and
 * Relationship rows. All-or-nothing, and safe to call twice with the same
 * importId (a double-tapped Confirm).
 */
export async function importReviewedTree(
  db: Db,
  userId: string,
  treeId: string,
  input: unknown,
): Promise<ImportResult> {
  await assertTreePermission(db, userId, treeId, "person.write");
  const parsed = importPayloadSchema.safeParse(input);
  if (!parsed.success) throw badRequest("invalid_import", parsed.error.issues.slice(0, 10));
  const payload = parsed.data;

  const previous = await db.activityLog.findFirst({
    where: { treeId, action: "imported", entityId: payload.importId },
  });
  if (previous) return { ...(previous.after as Omit<ImportResult, "alreadyImported">), alreadyImported: true };

  // References must be unique and every link must point at someone in the payload.
  const refs = new Set<string>();
  for (const p of payload.people) {
    if (refs.has(p.ref)) throw badRequest("duplicate_ref", { ref: p.ref });
    refs.add(p.ref);
  }
  for (const r of payload.relationships) {
    if (!refs.has(r.from) || !refs.has(r.to)) throw badRequest("unknown_ref", r);
  }
  const pageKeys = new Set(payload.pages.map((p) => p.key));
  if (payload.people.some((p) => p.pageKey && !pageKeys.has(p.pageKey))) throw badRequest("unknown_page");

  // People linked to existing tree members must really be live members of this tree.
  const existingIds = [...new Set(payload.people.flatMap((p) => (p.existingId ? [p.existingId] : [])))];
  if (existingIds.length) {
    const found = await db.person.count({ where: { id: { in: existingIds }, treeId, deletedAt: null } });
    if (found !== existingIds.length) throw badRequest("unknown_existing_person");
  }

  // Final identity of every ref: an existing id, or a fresh id we choose now.
  const idFor = new Map(payload.people.map((p) => [p.ref, p.existingId ?? randomUUID()]));
  const newEdges: Edge[] = payload.relationships.map((r) => ({
    type: r.type,
    from: idFor.get(r.from)!,
    to: idFor.get(r.to)!,
  }));
  const current = await db.relationship.findMany({
    where: liveRelationshipsWhere(treeId),
    select: { type: true, personAId: true, personBId: true },
  });
  const currentEdges: Edge[] = current.map((r) => ({ type: r.type, from: r.personAId, to: r.personBId }));
  const issues = checkGraph([...currentEdges, ...newEdges]);
  if (issues.length) throw badRequest("invalid_relationships", issues.slice(0, 10));

  // Canonical rows, minus links that already exist.
  const rowKey = (type: string, a: string, b: string) => `${type}|${a}|${b}`;
  const existingKeys = new Set(current.map((r) => rowKey(r.type, r.personAId, r.personBId)));
  const relRows = new Map<string, { type: Edge["type"]; personAId: string; personBId: string }>();
  for (const e of newEdges) {
    const [a, b] = e.type === "SPOUSE" && e.to < e.from ? [e.to, e.from] : [e.from, e.to];
    const k = rowKey(e.type, a, b);
    if (!existingKeys.has(k)) relRows.set(k, { type: e.type, personAId: a, personBId: b });
  }

  const toCreate = payload.people.filter((p) => !p.existingId);
  const result: Omit<ImportResult, "alreadyImported"> = {
    people: toCreate.length,
    linked: payload.people.length - toCreate.length,
    relationships: relRows.size,
    pages: payload.pages.length,
  };

  await db.$transaction(
    async (tx) => {
      const pageIdFor = new Map<string, string>();
      for (const page of payload.pages) {
        const row = await tx.sourcePage.create({
          data: {
            treeId,
            pageIndex: page.pageIndex,
            model: page.model,
            extraction: page.extraction as Prisma.InputJsonValue,
            uploadedById: userId,
          },
        });
        pageIdFor.set(page.key, row.id);
      }

      await tx.person.createMany({
        data: toCreate.map((p) => ({
          id: idFor.get(p.ref)!,
          treeId,
          ...personDataFromFields(p.fields),
          sourcePageId: p.pageKey ? (pageIdFor.get(p.pageKey) ?? null) : null,
          sourceBox: p.bbox && p.pageKey ? { page: p.pageKey, box: p.bbox } : undefined,
          updatedById: userId,
        })),
      });

      // A soft-deleted copy of a link would block the insert; bring it back instead.
      const rows = [...relRows.values()];
      if (rows.length) {
        await tx.relationship.updateMany({
          where: { treeId, deletedAt: { not: null }, OR: rows },
          data: { deletedAt: null, version: { increment: 1 } },
        });
        await tx.relationship.createMany({
          data: rows.map((r) => ({ treeId, ...r })),
          skipDuplicates: true,
        });
      }

      await logActivity(tx, {
        treeId,
        userId,
        action: "imported",
        entityType: "import",
        entityId: payload.importId,
        after: result,
      });
      await touchTree(tx, treeId, userId);
    },
    { timeout: 30_000 },
  );

  return { ...result, alreadyImported: false };
}

/** People already in the tree, for "same as someone already in this tree?" prompts. */
export async function existingPeopleForReview(db: Db, userId: string, treeId: string) {
  await assertTreePermission(db, userId, treeId, "person.write");
  const [people, rels] = await Promise.all([
    db.person.findMany({
      where: { treeId, deletedAt: null },
      select: { id: true, fullName: true, birthDate: true },
      orderBy: { fullName: "asc" },
    }),
    db.relationship.findMany({
      where: liveRelationshipsWhere(treeId),
      select: { type: true, personAId: true, personBId: true },
    }),
  ]);
  return {
    people,
    edges: rels.map((r) => ({ type: r.type, from: r.personAId, to: r.personBId })) satisfies Edge[],
  };
}
