import type { Role } from "@/generated/prisma/enums";
import type { Db } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import { can, type Permission } from "./roles";

export type TreeAccess = {
  userId: string;
  treeId: string;
  role: Role;
  tree: { id: string; name: string; hideLivingFromViewers: boolean; allowCrossFamilyMatch: boolean };
};

/**
 * The single gate every tree read/write goes through. Non-members (including
 * removed members) get 404; members without the permission get 403.
 */
export async function assertTreePermission(
  db: Db,
  userId: string,
  treeId: string,
  permission: Permission,
): Promise<TreeAccess> {
  const member = await db.treeMember.findUnique({
    where: { treeId_userId: { treeId, userId } },
    include: {
      tree: {
        select: { id: true, name: true, hideLivingFromViewers: true, allowCrossFamilyMatch: true },
      },
    },
  });
  if (!member) throw notFound("tree_not_found");
  if (!can(member.role, permission)) throw forbidden(`requires_${permission}`);
  return { userId, treeId, role: member.role, tree: member.tree };
}
