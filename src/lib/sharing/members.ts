import type { Db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { logActivity } from "@/lib/activity";
import { badRequest, notFound } from "@/lib/errors";

type Tx = Prisma.TransactionClient;

async function ownerCount(tx: Tx, treeId: string) {
  return tx.treeMember.count({ where: { treeId, role: "OWNER" } });
}

export async function listMembers(db: Db, userId: string, treeId: string) {
  await assertTreePermission(db, userId, treeId, "tree.read");
  return db.treeMember.findMany({
    where: { treeId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });
}

/** Owners change roles. The last owner can't be demoted, so a tree is never orphaned. */
export async function changeMemberRole(
  db: Db,
  userId: string,
  treeId: string,
  memberUserId: string,
  role: Role,
) {
  await assertTreePermission(db, userId, treeId, "member.manage");
  return db.$transaction(async (tx) => {
    const member = await tx.treeMember.findUnique({
      where: { treeId_userId: { treeId, userId: memberUserId } },
    });
    if (!member) throw notFound("member_not_found");
    if (member.role === role) return member;
    if (member.role === "OWNER" && (await ownerCount(tx, treeId)) <= 1) {
      throw badRequest("last_owner");
    }
    const updated = await tx.treeMember.update({
      where: { treeId_userId: { treeId, userId: memberUserId } },
      data: { role },
    });
    await logActivity(tx, {
      treeId,
      userId,
      action: "role_changed",
      entityType: "member",
      entityId: memberUserId,
      before: { role: member.role },
      after: { role },
    });
    return updated;
  });
}

async function removeMembership(tx: Tx, treeId: string, memberUserId: string) {
  const member = await tx.treeMember.findUnique({
    where: { treeId_userId: { treeId, userId: memberUserId } },
  });
  if (!member) throw notFound("member_not_found");
  if (member.role === "OWNER" && (await ownerCount(tx, treeId)) <= 1) {
    throw badRequest("last_owner");
  }
  await tx.treeMember.delete({ where: { treeId_userId: { treeId, userId: memberUserId } } });
  return member;
}

export async function removeMember(db: Db, userId: string, treeId: string, memberUserId: string) {
  await assertTreePermission(db, userId, treeId, "member.manage");
  return db.$transaction(async (tx) => {
    const member = await removeMembership(tx, treeId, memberUserId);
    await logActivity(tx, {
      treeId,
      userId,
      action: "removed",
      entityType: "member",
      entityId: memberUserId,
      before: { role: member.role },
    });
  });
}

/** Any member can leave, except the last owner (they must promote someone or delete the tree). */
export async function leaveTree(db: Db, userId: string, treeId: string) {
  await assertTreePermission(db, userId, treeId, "tree.leave");
  return db.$transaction(async (tx) => {
    const member = await removeMembership(tx, treeId, userId);
    await logActivity(tx, {
      treeId,
      userId,
      action: "left",
      entityType: "member",
      entityId: userId,
      before: { role: member.role },
    });
  });
}
