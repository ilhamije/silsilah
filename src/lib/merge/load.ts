import type { Db } from "@/lib/db";
import { liveRelationshipsWhere } from "@/lib/relationships";
import type { MergeTree } from "./types";

/** A tree as the matcher sees it: live people and relationships only. */
export async function loadMergeTree(db: Db, treeId: string): Promise<MergeTree> {
  const [people, rels] = await Promise.all([
    db.person.findMany({
      where: { treeId, deletedAt: null },
      select: { id: true, fullName: true, nicknames: true, gender: true, birthYear: true },
    }),
    db.relationship.findMany({
      where: liveRelationshipsWhere(treeId),
      select: { type: true, personAId: true, personBId: true },
    }),
  ]);
  return {
    id: treeId,
    people,
    parentChild: rels.filter((r) => r.type === "PARENT_CHILD").map((r) => [r.personAId, r.personBId]),
    spouses: rels.filter((r) => r.type === "SPOUSE").map((r) => [r.personAId, r.personBId]),
  };
}
