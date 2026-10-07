import { beforeEach, expect, it } from "vitest";
import { describeDb, makeUser, resetDb, testDb } from "../helpers/db";
import { createTree } from "@/lib/trees";
import { createPerson } from "@/lib/people";
import { backfillNameKeys } from "@/lib/merge/backfill";

const db = testDb();

async function setup() {
  const user = await makeUser("owner");
  const tree = await createTree(db, user.id, "Keluarga");
  const a = await createPerson(db, user.id, tree.id, { fullName: "Siti Aminah" });
  const b = await createPerson(db, user.id, tree.id, { fullName: "H. Muhammad Soerjo" });
  const c = await createPerson(db, user.id, tree.id, { fullName: "Budi" });
  // Simulate rows saved before the phonetic key: the old key was the whole lowercased name.
  await db.person.update({ where: { id: a.id }, data: { nameKey: "siti aminah" } });
  await db.person.update({ where: { id: b.id }, data: { nameKey: "h muhammad soerjo" } });
  return { a, b, c };
}

describeDb("nameKey backfill", () => {
  beforeEach(resetDb);

  it("counts without changing anything on a dry run", async () => {
    const { a } = await setup();
    const r = await backfillNameKeys(db, { dryRun: true });
    expect(r).toEqual({ scanned: 3, stale: 2, updated: 0 });
    expect((await db.person.findUniqueOrThrow({ where: { id: a.id } })).nameKey).toBe("siti aminah");
  });

  it("fixes only stale keys, keeps versions, and is safe to repeat", async () => {
    const { a, b } = await setup();
    const before = await db.person.findUniqueOrThrow({ where: { id: a.id } });
    const r = await backfillNameKeys(db, { batchSize: 2 });
    expect(r).toEqual({ scanned: 3, stale: 2, updated: 2 });
    const after = await db.person.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.nameKey).toBe("st"); // phonetic key of "siti"
    expect(after.version).toBe(before.version);
    expect((await db.person.findUniqueOrThrow({ where: { id: b.id } })).nameKey).toBe("mmd");
    expect(await backfillNameKeys(db)).toEqual({ scanned: 3, stale: 0, updated: 0 });
  });
});
