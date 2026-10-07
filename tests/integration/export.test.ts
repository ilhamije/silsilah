import { beforeEach, expect, it } from "vitest";
import { describeDb, makeUser, resetDb, testDb } from "../helpers/db";
import { createTree } from "@/lib/trees";
import { createPerson } from "@/lib/people";
import { exportTree } from "@/lib/export-tree";
import { HttpError } from "@/lib/errors";

const db = testDb();

async function setup() {
  const owner = await makeUser("owner");
  const viewer = await makeUser("viewer");
  const stranger = await makeUser("stranger");
  const tree = await createTree(db, owner.id, "Keluarga Hasan");
  await db.treeMember.create({ data: { treeId: tree.id, userId: viewer.id, role: "VIEWER" } });
  const year = new Date().getFullYear() - 30;
  await createPerson(db, owner.id, tree.id, { fullName: "Sari Living", birthDate: String(year), birthPlace: "Bandung" });
  await createPerson(db, owner.id, tree.id, { fullName: "Hasan Late", birthDate: "1900", deathDate: "1970", birthPlace: "Garut" });
  return { owner, viewer, stranger, tree };
}

describeDb("exporting a tree", () => {
  beforeEach(resetDb);

  it("gives editors everything, in both formats", async () => {
    const { owner, tree } = await setup();
    const ged = await exportTree(db, owner.id, tree.id, "gedcom");
    expect(ged.filename).toBe("keluarga-hasan.ged");
    expect(ged.body).toContain("2 PLAC Bandung");
    const json = JSON.parse((await exportTree(db, owner.id, tree.id, "json")).body);
    expect(json.people).toHaveLength(2);
    expect(json.people.find((p: { fullName: string }) => p.fullName === "Sari Living").birthPlace).toBe("Bandung");
  });

  it("hides living people's details from viewers, as the chart does", async () => {
    const { viewer, tree } = await setup();
    const ged = (await exportTree(db, viewer.id, tree.id, "gedcom")).body;
    expect(ged).toContain("Sari Living");
    expect(ged).not.toContain("Bandung");
    expect(ged).toContain("2 PLAC Garut");
    const json = JSON.parse((await exportTree(db, viewer.id, tree.id, "json")).body);
    expect(json.people.find((p: { fullName: string }) => p.fullName === "Sari Living").birthPlace).toBeNull();
  });

  it("refuses people who aren't members", async () => {
    const { stranger, tree } = await setup();
    const err = await exportTree(db, stranger.id, tree.id, "json").catch((e: unknown) => e);
    expect((err as HttpError).status).toBe(404);
  });
});
