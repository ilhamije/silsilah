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
  const [tree, people, relationships] = await Promise.all([
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
  };
}
