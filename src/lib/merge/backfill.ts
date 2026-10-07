import type { Db } from "@/lib/db";
import { nameKey } from "@/lib/tree/name-key";

/**
 * Recomputes Person.nameKey for people whose stored key is out of date, such
 * as everyone saved before the phonetic key arrived. Safe to run any number of
 * times: people already correct are left alone. Pass dryRun to only count.
 */
export async function backfillNameKeys(db: Db, opts: { dryRun?: boolean; batchSize?: number } = {}) {
  const batchSize = opts.batchSize ?? 500;
  let cursor: string | undefined;
  let scanned = 0;
  let stale = 0;
  for (;;) {
    const batch = await db.person.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, fullName: true, nameKey: true },
    });
    if (!batch.length) break;
    cursor = batch[batch.length - 1].id;
    scanned += batch.length;
    const changes = batch.map((p) => ({ id: p.id, key: nameKey(p.fullName), old: p.nameKey })).filter((c) => c.key !== c.old);
    stale += changes.length;
    if (!opts.dryRun && changes.length) {
      // Only the key changes: no version bump, so nobody sees a false edit conflict.
      await db.$transaction(changes.map((c) => db.person.update({ where: { id: c.id }, data: { nameKey: c.key }, select: { id: true } })));
    }
  }
  return { scanned, stale, updated: opts.dryRun ? 0 : stale };
}
