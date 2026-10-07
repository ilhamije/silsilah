/*
 * Applies pending database migrations as the first step of `npm run build`,
 * so new code never goes live before the columns it needs.
 *
 * - Production builds on Vercel (VERCEL_ENV=production): runs `prisma migrate deploy`.
 *   If it fails the build fails and the previous deployment stays live.
 * - Preview builds and local builds: skipped. Previews may share the production
 *   database, and an unmerged branch must not change it. Set MIGRATE_ON_BUILD=1
 *   to force it (for example when previews have their own database branch).
 */
import { spawnSync } from "node:child_process";

const force = process.env.MIGRATE_ON_BUILD === "1";
const production = process.env.VERCEL_ENV === "production";

if (!force && !production) {
  console.log(`[migrate] skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}; set MIGRATE_ON_BUILD=1 to run)`);
  process.exit(0);
}

console.log("[migrate] applying pending migrations");
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", shell: process.platform === "win32" });
if (result.status !== 0) {
  console.error("[migrate] failed; stopping the build so the previous deployment stays live");
  process.exit(result.status ?? 1);
}
