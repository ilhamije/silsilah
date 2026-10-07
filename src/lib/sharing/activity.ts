import type { Db } from "@/lib/db";
import { assertTreePermission } from "@/lib/authz/tree-access";

/**
 * Who did what, newest first. The before/after values stay out: they can hold
 * details of living people that Viewers aren't allowed to see.
 */
export async function listActivity(db: Db, userId: string, treeId: string, limit = 30) {
  await assertTreePermission(db, userId, treeId, "activity.read");
  const rows = await db.activityLog.findMany({
    where: { treeId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
    select: { id: true, action: true, entityType: true, createdAt: true, user: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    createdAt: r.createdAt,
    who: r.user ? (r.user.name ?? r.user.email) : null,
  }));
}
