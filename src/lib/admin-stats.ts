import type { Db } from "@/lib/db";

/** App-wide counts for the admin page. No per-tree or per-person data. */
export async function getAdminStats(db: Db, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [users, trees, people, extractions30d, rejections30d] = await Promise.all([
    db.user.count(),
    db.familyTree.count(),
    db.person.count({ where: { deletedAt: null } }),
    db.extractionLog.count({ where: { createdAt: { gte: since } } }),
    db.extractionLog.count({
      where: { createdAt: { gte: since }, outcome: { in: ["REJECTED", "BORDERLINE"] } },
    }),
  ]);
  return { users, trees, people, extractions30d, rejections30d };
}
