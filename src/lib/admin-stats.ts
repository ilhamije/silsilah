import type { Db } from "@/lib/db";

/** App-wide counts for the admin page. No per-tree or per-person data. */
export async function getAdminStats(db: Db, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [users, trees, people, extractions30d, rejections30d, pendingMerges, outcomes] = await Promise.all([
    db.user.count(),
    db.familyTree.count(),
    db.person.count({ where: { deletedAt: null } }),
    db.extractionLog.count({ where: { createdAt: { gte: since } } }),
    db.extractionLog.count({
      where: { createdAt: { gte: since }, outcome: { in: ["REJECTED", "BORDERLINE"] } },
    }),
    db.mergeSuggestion.count({ where: { status: { in: ["PENDING", "REVIEWING"] } } }),
    db.mergeOutcome.groupBy({ by: ["band", "outcome"], _count: { _all: true }, _avg: { score: true } }),
  ]);
  return {
    users,
    trees,
    people,
    extractions30d,
    rejections30d,
    merges: {
      pending: pendingMerges,
      decided: outcomes.reduce((n, o) => n + o._count._all, 0),
      /** Counts of each decision per strength band, for tuning the thresholds. */
      outcomes: outcomes.map((o) => ({
        band: o.band,
        outcome: o.outcome,
        count: o._count._all,
        avgScore: Math.round((o._avg.score ?? 0) * 100) / 100,
      })),
    },
  };
}
