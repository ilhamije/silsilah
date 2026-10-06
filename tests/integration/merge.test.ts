import { beforeEach, expect, it } from "vitest";
import { describeDb, makeUser, resetDb, testDb } from "../helpers/db";
import { createTree } from "@/lib/trees";
import { createPerson } from "@/lib/people";
import { addRelative } from "@/lib/relationships";
import { detectMerges } from "@/lib/merge/detect";
import { acceptSuggestion, rejectSuggestion, undoOperation } from "@/lib/merge/apply";
import { getReview } from "@/lib/merge/read";

const db = testDb();

/** grandparent → parent → child, with optional differences in the child's record. */
async function family(userId: string, name: string, child: { fullName: string; birthPlace?: string }) {
  const tree = await createTree(db, userId, name);
  const parent = await createPerson(db, userId, tree.id, { fullName: "Budi Santoso", birthDate: "1950" });
  const grand = await addRelative(db, userId, tree.id, parent.id, "parent", { fullName: "Hasan Basri", birthDate: "1920" });
  const kid = await addRelative(db, userId, tree.id, parent.id, "child", { birthDate: "1978", ...child });
  return { tree, parent, grand, kid };
}

async function setup() {
  const user = await makeUser("editor");
  const a = await family(user.id, "Tree A", { fullName: "Siti Aminah", birthPlace: "Bandung" });
  const b = await family(user.id, "Tree B", { fullName: "Siti Aminah", birthPlace: "Cirebon" });
  return { user, a, b };
}

describeDb("merge detection and decisions", () => {
  beforeEach(resetDb);

  it("suggests matching trees once, however often detection runs", async () => {
    const { user, a } = await setup();
    expect((await detectMerges(db, a.tree.id, { userId: user.id })).created).toBe(1);
    expect((await detectMerges(db, a.tree.id, { userId: user.id })).created).toBe(0);
    expect(await db.mergeSuggestion.count()).toBe(1);
  });

  it("links the pairs, applies the chosen value to both people, and undo restores everything", async () => {
    const { user, a, b } = await setup();
    await detectMerges(db, a.tree.id, { userId: user.id });
    const s = await db.mergeSuggestion.findFirstOrThrow();
    const pairs = s.matchedPairs as { aId: string; bId: string }[];
    const kidPair = pairs.find((p) => [a.kid.id, b.kid.id].includes(p.aId))!;
    const key = `${kidPair.aId}:${kidPair.bId}`;

    const { operationId, linked } = await acceptSuggestion(db, user.id, s.id, {
      keep: pairs.map((p) => `${p.aId}:${p.bId}`),
      choices: { [key]: { birthPlace: "a" } },
    });
    expect(linked).toBe(pairs.length);
    const aKid = await db.person.findFirstOrThrow({ where: { id: { in: [a.kid.id, b.kid.id] }, treeId: s.treeAId } });
    const bKid = await db.person.findFirstOrThrow({ where: { id: { in: [a.kid.id, b.kid.id] }, treeId: s.treeBId } });
    expect(aKid.birthPlace).toBe(bKid.birthPlace);
    expect(await db.personLink.count({ where: { removedAt: null } })).toBe(pairs.length);

    const undone = await undoOperation(db, user.id, operationId);
    expect(undone.keptNewerEdits).toBe(0);
    expect(await db.personLink.count({ where: { removedAt: null } })).toBe(0);
    const places = (await db.person.findMany({ where: { id: { in: [a.kid.id, b.kid.id] } } })).map((p) => p.birthPlace).sort();
    expect(places).toEqual(["Bandung", "Cirebon"]);
    expect((await db.mergeSuggestion.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("PENDING");
  });

  it("does not suggest a rejected pair of trees again", async () => {
    const { user, a } = await setup();
    await detectMerges(db, a.tree.id, { userId: user.id });
    const s = await db.mergeSuggestion.findFirstOrThrow();
    await rejectSuggestion(db, user.id, s.id);
    expect((await detectMerges(db, a.tree.id, { userId: user.id })).created).toBe(0);
    expect(await db.mergeOutcome.count({ where: { outcome: "rejected" } })).toBe(1);
  });

  it("hides names of another family's tree until they accept", async () => {
    const owner = await makeUser("mine");
    const other = await makeUser("other");
    const mine = await family(owner.id, "Mine", { fullName: "Siti Aminah" });
    const theirs = await family(other.id, "Theirs", { fullName: "Siti Aminah" });
    await db.familyTree.updateMany({ data: { allowCrossFamilyMatch: true } });
    // Detection compares by name key, so the keys must exist for the seeded people.
    expect((await detectMerges(db, mine.tree.id, { userId: owner.id })).created).toBe(1);
    const s = await db.mergeSuggestion.findFirstOrThrow();
    expect(s.crossFamily).toBe(true);

    const mineView = await getReview(db, owner.id, s.id);
    expect(mineView.hidden).toBe("requester");
    expect(mineView.pairs).toHaveLength(0);
    const theirView = await getReview(db, other.id, s.id);
    expect(theirView.hidden).toBe("responder");
    const theirSide = theirView.treeA.id === theirs.tree.id ? "a" : "b";
    expect(theirView.pairs.every((p) => p[theirSide === "a" ? "b" : "a"] === null)).toBe(true);
  });
});
