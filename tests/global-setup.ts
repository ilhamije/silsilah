import { execSync } from "node:child_process";
import "dotenv/config";

/**
 * DB-backed tests run against DATABASE_URL_TEST (never the dev database).
 * Migrations are applied with `migrate deploy`; each suite truncates tables itself.
 * Unit tests don't need a database, so a missing variable skips DB suites.
 */
export default function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    console.warn("[tests] DATABASE_URL_TEST not set; DB-backed suites will be skipped");
    return;
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
  });
}
