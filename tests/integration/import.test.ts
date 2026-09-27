import { beforeEach, expect, it } from "vitest";
import { describeDb, makeUser, resetDb, testDb } from "../helpers/db";
import { fakeClient } from "../helpers/fake-ai";
import { HttpError } from "@/lib/errors";
import { createTree } from "@/lib/trees";
import { createPerson } from "@/lib/people";
import { createRelationship } from "@/lib/relationships";
import { runPageExtraction } from "@/lib/extraction/service";
import { combinePages, knownPeopleFrom } from "@/lib/ai/combine";
import {
  addPerson,
  buildDraft,
  confirmPerson,
  duplicatePrompts,
  linkExisting,
  mergePeople,
  newDraftPerson,
  toImportPayload,
  updatePerson,
  validateDraft,
} from "@/lib/review/draft";
import { existingPeopleForReview, importReviewedTree } from "@/lib/import/service";
import { readTree } from "@/lib/tree/read";
import valid from "../../fixtures/extraction-valid.json";
import page2 from "../../fixtures/extraction-page2.json";

const db = testDb();

async function setup() {
  const owner = await makeUser("owner");
  const viewer = await makeUser("viewer");
  const tree = await createTree(db, owner.id, "Keluarga Hasan");
  await db.treeMember.create({ data: { treeId: tree.id, userId: viewer.id, role: "VIEWER" } });
  return { owner, viewer, tree };
}

/** Upload → extract (AI mocked) → combine → review draft, as the browser does it. */
async function extractTwoPages(userId: string, treeId: string) {
  const request = (pageIndex: number, pageScope: string, knownPeople: ReturnType<typeof knownPeopleFrom>) => ({
    image: { base64: "AAAA", mediaType: "image/jpeg" as const },
    pageIndex,
    pageScope,
    totalPages: 2,
    knownPeople,
    locale: "en" as const,
  });
  const first = await runPageExtraction(db, userId, treeId, request(0, "pgA", []), {
    client: fakeClient([{ kind: "ok", output: valid }]).client,
  });
  const known = knownPeopleFrom(combinePages([{ pageIndex: 0, extraction: first.extraction }]).people);
  // The model recognises Rahmat from KNOWN_PEOPLE and reuses his id.
  const rahmat = known.find((k) => k.full_name === "Rahmat")!;
  const page2WithKnown = JSON.parse(JSON.stringify(page2).replaceAll('"p5"', JSON.stringify(rahmat.temp_id)));
  const second = await runPageExtraction(db, userId, treeId, request(1, "pgB", known), {
    client: fakeClient([{ kind: "ok", output: page2WithKnown }]).client,
  });
  const pages = [
    { key: "pgA", pageIndex: 0, model: first.model, extraction: first.extraction },
    { key: "pgB", pageIndex: 1, model: second.model, extraction: second.extraction },
  ];
  const combined = combinePages(pages.map((p) => ({ pageIndex: p.pageIndex, extraction: p.extraction })));
  return { pages, draft: buildDraft(combined, "basis") };
}

describeDb("upload → extract → review → save", () => {
  beforeEach(resetDb);

  it("saves the reviewed people and connections, with provenance", async () => {
    const { owner, tree } = await setup();
    const { pages, draft } = await extractTwoPages(owner.id, tree.id);
    expect(draft.people).toHaveLength(11); // Rahmat appears on both pages once

    // The user fixes Arif's birth year and confirms the illegible name.
    const arif = draft.people.find((p) => p.fullName === "Arif")!;
    const suarni = draft.people.find((p) => p.fullName === "Su?arni")!;
    let d = updatePerson(draft, arif.id, { birthDate: "1982" });
    d = updatePerson(confirmPerson(d, suarni.id), suarni.id, { fullName: "Sukarni" });
    expect(validateDraft(d)).toEqual([]);

    const result = await importReviewedTree(db, owner.id, tree.id, toImportPayload(d, pages, "import-first-1"));
    expect(result).toEqual({ people: 11, linked: 0, relationships: 17, pages: 2, alreadyImported: false });

    const saved = await readTree(db, owner.id, tree.id);
    expect(saved.people).toHaveLength(11);
    expect(saved.relationships).toHaveLength(17);
    const savedArif = saved.people.find((p) => p.fullName === "Arif")!;
    expect(savedArif).toMatchObject({ birthDate: "1982", birthYear: 1982, isLiving: true });
    expect(saved.people.find((p) => p.fullName === "H. Hasan bin Umar")).toMatchObject({ deathYear: 1998, isLiving: false });
    expect(saved.people.some((p) => p.fullName === "Sukarni")).toBe(true);

    const hasan = await db.person.findFirstOrThrow({ where: { fullName: "H. Hasan bin Umar" }, include: { sourcePage: true } });
    expect(hasan.sourcePage?.pageIndex).toBe(0);
    expect(hasan.sourceBox).toEqual({ page: "pgA", box: [0.3, 0.06, 0.18, 0.04] });
    expect(await db.sourcePage.count()).toBe(2);
    expect(await db.activityLog.count({ where: { action: "imported" } })).toBe(1);
  });

  it("a double-tapped Confirm saves only once", async () => {
    const { owner, tree } = await setup();
    const { pages, draft } = await extractTwoPages(owner.id, tree.id);
    const payload = toImportPayload(draft, pages, "import-twice-1");
    await importReviewedTree(db, owner.id, tree.id, payload);
    const again = await importReviewedTree(db, owner.id, tree.id, payload);
    expect(again.alreadyImported).toBe(true);
    expect(await db.person.count()).toBe(11);
  });

  it("links people already in the tree instead of creating them twice", async () => {
    const { owner, tree } = await setup();
    const hasan = await createPerson(db, owner.id, tree.id, { fullName: "H. Hasan bin Umar", birthDate: "1921" });
    const { pages, draft } = await extractTwoPages(owner.id, tree.id);
    const existing = await existingPeopleForReview(db, owner.id, tree.id);
    const prompt = duplicatePrompts(draft, existing.people).find((x) => x.kind === "existing")!;
    expect(prompt).toMatchObject({ kind: "existing", existing: { id: hasan.id } });

    const d = linkExisting(draft, prompt.a, hasan.id);
    const result = await importReviewedTree(db, owner.id, tree.id, toImportPayload(d, pages, "import-link-1"));
    expect(result).toMatchObject({ people: 10, linked: 1 });
    const children = await db.relationship.count({ where: { personAId: hasan.id, type: "PARENT_CHILD" } });
    expect(children).toBe(3); // Budi, Sari, Rahmat now attached to the existing Hasan
  });

  it("refuses links that would make someone their own ancestor, counting existing links", async () => {
    const { owner, tree } = await setup();
    const x = await createPerson(db, owner.id, tree.id, { fullName: "X" });
    const y = await createPerson(db, owner.id, tree.id, { fullName: "Y" });
    await createRelationship(db, owner.id, tree.id, { type: "PARENT_CHILD", fromPersonId: x.id, toPersonId: y.id });
    const payload = {
      importId: "import-cycle-1",
      pages: [],
      people: [
        { ref: "a", existingId: x.id, fields: { fullName: "X" }, pageKey: null, bbox: null },
        { ref: "b", existingId: y.id, fields: { fullName: "Y" }, pageKey: null, bbox: null },
      ],
      relationships: [{ type: "PARENT_CHILD", from: "b", to: "a" }],
    };
    const err = (await importReviewedTree(db, owner.id, tree.id, payload).catch((e: unknown) => e)) as HttpError;
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_relationships");
    expect(await db.relationship.count()).toBe(1);
  });

  it("viewers can't save, and nothing is written", async () => {
    const { owner, viewer, tree } = await setup();
    const { pages, draft } = await extractTwoPages(owner.id, tree.id);
    const err = (await importReviewedTree(db, viewer.id, tree.id, toImportPayload(draft, pages, "import-viewer")).catch(
      (e: unknown) => e,
    )) as HttpError;
    expect(err.status).toBe(403);
    expect(await db.person.count()).toBe(0);
  });

  it("rejects links to people from another tree", async () => {
    const { owner, tree } = await setup();
    const other = await createTree(db, owner.id, "Other");
    const stranger = await createPerson(db, owner.id, other.id, { fullName: "Stranger" });
    const { pages, draft } = await extractTwoPages(owner.id, tree.id);
    const d = linkExisting(draft, draft.people[0].id, stranger.id);
    const err = (await importReviewedTree(db, owner.id, tree.id, toImportPayload(d, pages, "import-cross")).catch(
      (e: unknown) => e,
    )) as HttpError;
    expect(err.code).toBe("unknown_existing_person");
  });

  it("merging a genuine duplicate saves one person", async () => {
    const { owner, tree } = await setup();
    const { pages, draft } = await extractTwoPages(owner.id, tree.id);
    const budi = draft.people.find((p) => p.fullName === "Budi Santoso")!;
    // The user added Budi by hand before noticing he was already read from the photo.
    const withDup = addPerson(draft, { ...newDraftPerson("m1", "Budi Santoso"), notes: "Guru" });
    const d = mergePeople(withDup, budi.id, "m1");
    const result = await importReviewedTree(db, owner.id, tree.id, toImportPayload(d, pages, "import-merge-1"));
    expect(result.people).toBe(11);
    expect(await db.person.findFirst({ where: { fullName: "Budi Santoso" } })).toMatchObject({ notes: "Guru" });
  });

  it("merging two different people who each have parents is caught before saving", async () => {
    const { owner, tree } = await setup();
    const { pages, draft } = await extractTwoPages(owner.id, tree.id);
    const saris = draft.people.filter((p) => p.fullName === "Sari"); // aunt (1953) and niece (1985)
    const d = mergePeople(draft, saris[0].id, saris[1].id);
    expect(validateDraft(d).map((i) => i.code)).toEqual(["too_many_parents"]);
    const err = (await importReviewedTree(db, owner.id, tree.id, toImportPayload(d, pages, "import-merge-2")).catch(
      (e: unknown) => e,
    )) as HttpError;
    expect(err.code).toBe("invalid_relationships");
    expect(await db.person.count()).toBe(0);
  });
});
