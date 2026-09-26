import type { Db } from "@/lib/db";

/** App-wide counts for the admin page. No per-tree or per-person data. */
export async function getAdminStats(db: Db, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [users, trees, people, images, rejections30d] = await Promise.all([
    db.user.count(),
    db.familyTree.count(),
    db.person.count({ where: { deletedAt: null } }),
    db.sourceImage.count(),
    db.rejectionLog.count({ where: { createdAt: { gte: since } } }),
  ]);
  return { users, trees, people, images, rejections30d };
}
