import { beforeEach, expect, it } from "vitest";
import { describeDb, makeUser, resetDb, testDb } from "../helpers/db";
import { HttpError } from "@/lib/errors";
import { createTree, updateTreeSettings } from "@/lib/trees";
import { listPendingSuggestions, submitSuggestedEdit } from "@/lib/sharing/suggested-edits";
import { createPerson, setSelfPerson, softDeletePerson } from "@/lib/people";
import { addRelative } from "@/lib/relationships";
import { readTree } from "@/lib/tree/read";

const db = testDb();

async function expectHttp(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).status).toBe(status);
  if (code) expect((err as HttpError).code).toBe(code);
}

async function setup() {
  const owner = await makeUser("owner");
  const viewer = await makeUser("viewer");
  const tree = await createTree(db, owner.id, "Keluarga Hasan");
  await db.treeMember.create({ data: { treeId: tree.id, userId: viewer.id, role: "VIEWER" } });
  const sari = await createPerson(db, owner.id, tree.id, { fullName: "Sari" });
  return { owner, viewer, tree, sari };
}

describeDb("adding relatives from the chart", () => {
  beforeEach(resetDb);

  it("adds a parent, a child and a spouse, each connected the right way", async () => {
    const { owner, tree, sari } = await setup();
    const father = await addRelative(db, owner.id, tree.id, sari.id, "parent", { fullName: "Hasan" });
    const child = await addRelative(db, owner.id, tree.id, sari.id, "child", { fullName: "Budi" });
    const spouse = await addRelative(db, owner.id, tree.id, sari.id, "spouse", { fullName: "Andi" });

    const { relationships } = await readTree(db, owner.id, tree.id);
    const has = (type: string, a: string, b: string) =>
      relationships.some((r) => r.type === type && r.personAId === a && r.personBId === b);
    expect(has("PARENT_CHILD", father.id, sari.id)).toBe(true);
    expect(has("PARENT_CHILD", sari.id, child.id)).toBe(true);
    const [a, b] = [sari.id, spouse.id].sort();
    expect(has("SPOUSE", a, b)).toBe(true);

    const log = await db.activityLog.count({ where: { treeId: tree.id } });
    expect(log).toBeGreaterThanOrEqual(7); // Sari + 3 × (person + relationship)
  });

  it("adds a sibling under a placeholder parent when there are no parents yet", async () => {
    const { owner, tree, sari } = await setup();
    const sibling = await addRelative(db, owner.id, tree.id, sari.id, "sibling", { fullName: "Dewi" });

    const { people, relationships } = await readTree(db, owner.id, tree.id);
    const parentIds = (id: string) =>
      relationships.filter((r) => r.type === "PARENT_CHILD" && r.personBId === id).map((r) => r.personAId);
    const [shared] = parentIds(sari.id);
    expect(parentIds(sari.id)).toHaveLength(1);
    expect(parentIds(sibling.id)).toEqual([shared]);
    expect(people.find((p) => p.id === shared)?.fullName).toBe("Unknown");
  });

  it("gives a sibling the same parents as the person", async () => {
    const { owner, tree, sari } = await setup();
    const father = await addRelative(db, owner.id, tree.id, sari.id, "parent", { fullName: "Hasan" });
    const mother = await addRelative(db, owner.id, tree.id, sari.id, "parent", { fullName: "Aminah" });
    const sibling = await addRelative(db, owner.id, tree.id, sari.id, "sibling", { fullName: "Dewi" });

    const { people, relationships } = await readTree(db, owner.id, tree.id);
    const parents = relationships.filter((r) => r.type === "PARENT_CHILD" && r.personBId === sibling.id).map((r) => r.personAId);
    expect(parents.sort()).toEqual([father.id, mother.id].sort());
    expect(people.some((p) => p.fullName === "Unknown")).toBe(false);
  });

  it("refuses a third parent and creates nobody", async () => {
    const { owner, tree, sari } = await setup();
    await addRelative(db, owner.id, tree.id, sari.id, "parent", { fullName: "Hasan" });
    await addRelative(db, owner.id, tree.id, sari.id, "parent", { fullName: "Aminah" });
    const before = await db.person.count({ where: { treeId: tree.id } });
    await expectHttp(addRelative(db, owner.id, tree.id, sari.id, "parent", { fullName: "Extra" }), 400, "too_many_parents");
    expect(await db.person.count({ where: { treeId: tree.id } })).toBe(before);
  });

  it("doesn't count a parent in recently deleted", async () => {
    const { owner, tree, sari } = await setup();
    const p1 = await addRelative(db, owner.id, tree.id, sari.id, "parent", { fullName: "Hasan" });
    await addRelative(db, owner.id, tree.id, sari.id, "parent", { fullName: "Aminah" });
    await softDeletePerson(db, owner.id, tree.id, p1.id, p1.version);
    await expect(addRelative(db, owner.id, tree.id, sari.id, "parent", { fullName: "Umar" })).resolves.toBeTruthy();
  });

  it("is for editors only, and only within the tree", async () => {
    const { owner, viewer, tree, sari } = await setup();
    await expectHttp(addRelative(db, viewer.id, tree.id, sari.id, "child", { fullName: "Budi" }), 403);
    const other = await createTree(db, owner.id, "Other");
    await expectHttp(addRelative(db, owner.id, other.id, sari.id, "child", { fullName: "Budi" }), 404, "person_not_found");
  });

  it("validates the kind and the name", async () => {
    const { owner, tree, sari } = await setup();
    await expectHttp(addRelative(db, owner.id, tree.id, sari.id, "cousin", { fullName: "X" }), 400, "invalid_relative_kind");
    await expectHttp(addRelative(db, owner.id, tree.id, sari.id, "child", { fullName: "  " }), 400, "invalid_person");
  });

  it("adds a couple's child with both parents, or a step-child with one", async () => {
    const { owner, tree, sari } = await setup();
    const andi = await addRelative(db, owner.id, tree.id, sari.id, "spouse", { fullName: "Andi" });
    const shared = await addRelative(db, owner.id, tree.id, sari.id, "child", { fullName: "Rina" }, andi.id);
    const step = await addRelative(db, owner.id, tree.id, andi.id, "child", { fullName: "Tono" });

    const parentsOf = async (id: string) =>
      (await db.relationship.findMany({ where: { type: "PARENT_CHILD", personBId: id, deletedAt: null } }))
        .map((r) => r.personAId)
        .sort();
    expect(await parentsOf(shared.id)).toEqual([andi.id, sari.id].sort());
    expect(await parentsOf(step.id)).toEqual([andi.id]);
  });

  it("refuses an other parent outside the tree or the same person", async () => {
    const { owner, tree, sari } = await setup();
    const other = await createTree(db, owner.id, "Other");
    const stranger = await createPerson(db, owner.id, other.id, { fullName: "Stranger" });
    await expectHttp(addRelative(db, owner.id, tree.id, sari.id, "child", { fullName: "X" }, stranger.id), 400, "invalid_other_parent");
    await expectHttp(addRelative(db, owner.id, tree.id, sari.id, "child", { fullName: "X" }, sari.id), 400, "invalid_other_parent");
  });
});

describeDb("suggestions and renaming", () => {
  beforeEach(resetDb);

  it("lists pending suggestions for editors only", async () => {
    const { owner, viewer, tree, sari } = await setup();
    await submitSuggestedEdit(db, viewer.id, tree.id, sari.id, { birthDate: "1950" });
    const list = await listPendingSuggestions(db, owner.id, tree.id);
    expect(list).toHaveLength(1);
    expect(list[0].proposedChanges).toEqual({ birthDate: "1950" });
    await expectHttp(listPendingSuggestions(db, viewer.id, tree.id), 403);
  });

  it("lets owners rename, refuses blank names and non-owners", async () => {
    const { owner, viewer, tree } = await setup();
    await updateTreeSettings(db, owner.id, tree.id, { name: "Bani Hasan" });
    expect((await db.familyTree.findUnique({ where: { id: tree.id } }))?.name).toBe("Bani Hasan");
    await expectHttp(updateTreeSettings(db, owner.id, tree.id, { name: "   " }), 400, "invalid_name");
    await expectHttp(updateTreeSettings(db, viewer.id, tree.id, { name: "Mine" }), 403);
  });
});

describeDb("This is me", () => {
  beforeEach(resetDb);

  it("each member marks their own person; it's cleared when that person is deleted", async () => {
    const { owner, viewer, tree, sari } = await setup();
    const hasan = await createPerson(db, owner.id, tree.id, { fullName: "Hasan" });
    await setSelfPerson(db, owner.id, tree.id, sari.id);
    await setSelfPerson(db, viewer.id, tree.id, hasan.id); // viewers may say who they are

    expect((await readTree(db, owner.id, tree.id)).selfPersonId).toBe(sari.id);
    expect((await readTree(db, viewer.id, tree.id)).selfPersonId).toBe(hasan.id);

    await softDeletePerson(db, owner.id, tree.id, sari.id, sari.version);
    expect((await readTree(db, owner.id, tree.id)).selfPersonId).toBeNull();

    await setSelfPerson(db, viewer.id, tree.id, null);
    expect((await readTree(db, viewer.id, tree.id)).selfPersonId).toBeNull();
  });

  it("refuses someone from another tree", async () => {
    const { owner, tree } = await setup();
    const other = await createTree(db, owner.id, "Other");
    const stranger = await createPerson(db, owner.id, other.id, { fullName: "Stranger" });
    await expectHttp(setSelfPerson(db, owner.id, tree.id, stranger.id), 404, "person_not_found");
  });
});
