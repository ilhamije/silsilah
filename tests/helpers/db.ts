import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { Db } from "@/lib/db";
import { describe } from "vitest";

const url = process.env.DATABASE_URL_TEST;

/** describe() that is skipped when no test database is configured. */
export const describeDb = url ? describe : describe.skip;

let client: PrismaClient | undefined;

export function testDb(): Db {
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  return client;
}

export async function resetDb() {
  const db = testDb();
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

let counter = 0;
export async function makeUser(name = "user") {
  counter += 1;
  return testDb().user.create({
    data: { name, email: `${name}-${counter}-${Date.now()}@example.test` },
  });
}
