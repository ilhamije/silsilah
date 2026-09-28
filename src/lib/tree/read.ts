import type { Db } from "@/lib/db";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { liveRelationshipsWhere } from "@/lib/relationships";
import { redactPerson } from "./redact";

/**
 * Everything the tree view needs, already filtered for the caller's role.
 * All person data sent to a client must come through here (or redactPerson).
 */
export async function readTree(db: Db, userId: string, treeId: string) {
  const access = await assertTreePermission(db, userId, treeId, "tree.read");
  const [tree, people, relationships, member] = await Promise.all([
    db.familyTree.findUniqueOrThrow({
      where: { id: treeId },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        hideLivingFromViewers: true,
        allowCrossFamilyMatch: true,
        lastEditedById: true,
      },
    }),
    db.person.findMany({
      where: { treeId, deletedAt: null },
      orderBy: [{ birthYear: "asc" }, { fullName: "asc" }],
      omit: { nameKey: true },
    }),
    db.relationship.findMany({
      where: liveRelationshipsWhere(treeId),
      select: { id: true, type: true, personAId: true, personBId: true, version: true },
    }),
    db.treeMember.findUnique({ where: { treeId_userId: { treeId, userId } }, select: { personId: true } }),
  ]);
  const lastEditor = tree.lastEditedById
    ? await db.user.findUnique({
        where: { id: tree.lastEditedById },
        select: { id: true, name: true, email: true },
      })
    : null;
  return {
    role: access.role,
    tree,
    lastEditor,
    people: people.map((p) => redactPerson(p, access.role, tree.hideLivingFromViewers)),
    relationships,
    /** The caller's own person ("This is me"), if they've said and that person isn't deleted. */
    selfPersonId: people.some((p) => p.id === member?.personId) ? member!.personId : null,
  };
}
