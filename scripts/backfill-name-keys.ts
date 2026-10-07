/*
 * Recomputes Person.nameKey with the current normalizer. Run once after
 * deploying phase 5, and again if the normalizer ever changes:
 *
 *   npx tsx scripts/backfill-name-keys.ts --dry-run   # count only
 *   npx tsx scripts/backfill-name-keys.ts             # apply
 *
 * Uses SIL7878_DATABASE_URL from .env, which may be the production database.
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { backfillNameKeys } from "../src/lib/merge/backfill";

const dryRun = process.argv.includes("--dry-run");
const host = new URL(process.env.SIL7878_DATABASE_URL ?? "postgres://unset").host;
console.log(`${dryRun ? "Dry run on" : "Updating"} ${host}`);

backfillNameKeys(db, { dryRun })
  .then((r) => {
    console.log(`Scanned ${r.scanned} people, ${r.stale} out of date, ${r.updated} updated.`);
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
