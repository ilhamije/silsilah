import { z } from "zod";
import type { Db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { logActivity, touchTree } from "@/lib/activity";
import { badRequest, ConflictError, notFound } from "@/lib/errors";

type Tx = Prisma.TransactionClient;

export const relationshipInputSchema = z.object({
  type: z.enum(["PARENT_CHILD", "SPOUSE"]),
  // PARENT_CHILD: from = parent, to = child.
  fromPersonId: z.string().min(1),
  toPersonId: z.string().min(1),
});

/** Is `candidate` a descendant of `ancestor` within the tree's live relationships? */
async function isDescendant(tx: Tx, treeId: string, ancestor: string, candidate: string) {
  const edges = await tx.relationship.findMany({
    where: { treeId, type: "PARENT_CHILD", deletedAt: null },
    select: { personAId: true, personBId: true },
  });
  const children = new Map<string, string[]>();
  for (const e of edges) {
    children.set(e.personAId, [...(children.get(e.personAId) ?? []), e.personBId]);
  }
  const seen = new Set<string>();
  const stack = [ancestor];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of children.get(id) ?? []) {
      if (child === candidate) return true;
      if (!seen.has(child)) {
        seen.add(child);
        stack.push(child);
      }
    }
  }
  return false;
}

export async function createRelationship(db: Db, userId: string, treeId: string, input: unknown) {
  await assertTreePermission(db, userId, treeId, "relationship.write");
  const parsed = relationshipInputSchema.safeParse(input);
  if (!parsed.success) throw badRequest("invalid_relationship", parsed.error.issues);
  const { type, fromPersonId, toPersonId } = parsed.data;
  if (fromPersonId === toPersonId) throw badRequest("self_relationship");

  // Spouses are stored in canonical order so each pair has one row.
  const [personAId, personBId] =
    type === "SPOUSE" && toPersonId < fromPersonId
      ? [toPersonId, fromPersonId]
      : [fromPersonId, toPersonId];

  return db.$transaction(async (tx) => {
    const people = await tx.person.count({
      where: { id: { in: [personAId, personBId] }, treeId, deletedAt: null },
    });
    if (people !== 2) throw notFound("person_not_found");

    if (type === "PARENT_CHILD") {
      // A child can't also be the parent's ancestor.
      if (await isDescendant(tx, treeId, personBId, personAId)) throw badRequest("cycle");
      const parentCount = await tx.relationship.count({
        where: { treeId, type: "PARENT_CHILD", personBId, deletedAt: null, NOT: { personAId } },
      });
      if (parentCount >= 2) throw badRequest("too_many_parents");
    }

    const key = { treeId_type_personAId_personBId: { treeId, type, personAId, personBId } };
    const existing = await tx.relationship.findUnique({ where: key });
    if (existing && !existing.deletedAt) throw badRequest("relationship_exists");

    const rel = existing
      ? await tx.relationship.update({
          where: { id: existing.id },
          data: { deletedAt: null, version: { increment: 1 } },
        })
      : await tx.relationship.create({ data: { treeId, type, personAId, personBId } });

    await logActivity(tx, {
      treeId,
      userId,
      action: "created",
      entityType: "relationship",
      entityId: rel.id,
      after: { type, personAId, personBId },
    });
    await touchTree(tx, treeId, userId);
    return rel;
  });
}

export async function deleteRelationship(
  db: Db,
  userId: string,
  treeId: string,
  relationshipId: string,
  expectedVersion: number,
) {
  await assertTreePermission(db, userId, treeId, "relationship.write");
  return db.$transaction(async (tx) => {
    const rel = await tx.relationship.findFirst({
      where: { id: relationshipId, treeId, deletedAt: null },
    });
    if (!rel) throw notFound("relationship_not_found");
    const { count } = await tx.relationship.updateMany({
      where: { id: relationshipId, version: expectedVersion },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (count === 0) throw new ConflictError(rel);
    await logActivity(tx, {
      treeId,
      userId,
      action: "deleted",
      entityType: "relationship",
      entityId: rel.id,
      before: { type: rel.type, personAId: rel.personAId, personBId: rel.personBId },
    });
    await touchTree(tx, treeId, userId);
  });
}

/**
 * Live relationships of a tree: excludes deleted rows and rows touching a
 * person who is in "recently deleted".
 */
export function liveRelationshipsWhere(treeId: string) {
  return {
    treeId,
    deletedAt: null,
    personA: { deletedAt: null },
    personB: { deletedAt: null },
  } satisfies Prisma.RelationshipWhereInput;
}
