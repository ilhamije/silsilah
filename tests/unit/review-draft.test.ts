import { describe, expect, it } from "vitest";
import { checkGraph } from "@/lib/tree/graph";
import { extractionSchema } from "@/lib/ai/schema";
import { combinePages, scopePageIds } from "@/lib/ai/combine";
import {
  addPerson,
  addRelationship,
  buildDraft,
  confirmPerson,
  dismissPair,
  duplicatePrompts,
  fieldNeedsCheck,
  linkExisting,
  mergePeople,
  newDraftPerson,
  personNeedsCheck,
  relationshipNeedsCheck,
  removePerson,
  swapRelationship,
  toImportPayload,
  updatePerson,
  validateDraft,
} from "@/lib/review/draft";
import { importPayloadSchema } from "@/lib/import/schema";
import valid from "../../fixtures/extraction-valid.json";

const page = scopePageIds(extractionSchema.parse(valid), "pgA", new Set());
const draft = buildDraft(combinePages([{ pageIndex: 0, extraction: page }]), "basis");
const byName = (d: typeof draft, name: string) => d.people.find((p) => p.fullName === name)!;

describe("checkGraph", () => {
  it("accepts a normal family", () => {
    expect(checkGraph([
      { type: "SPOUSE", from: "a", to: "b" },
      { type: "PARENT_CHILD", from: "a", to: "c" },
      { type: "PARENT_CHILD", from: "b", to: "c" },
    ])).toEqual([]);
  });
  it("finds someone who would be their own ancestor", () => {
    const issues = checkGraph([
      { type: "PARENT_CHILD", from: "a", to: "b" },
      { type: "PARENT_CHILD", from: "b", to: "c" },
      { type: "PARENT_CHILD", from: "c", to: "a" },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("cycle");
    expect([...issues[0].people].sort()).toEqual(["a", "b", "c"]);
  });
  it("finds a child with three parents and a self-link", () => {
    const codes = checkGraph([
      { type: "PARENT_CHILD", from: "a", to: "d" },
      { type: "PARENT_CHILD", from: "b", to: "d" },
      { type: "PARENT_CHILD", from: "c", to: "d" },
      { type: "SPOUSE", from: "e", to: "e" },
    ]).map((i) => i.code);
    expect(codes.sort()).toEqual(["self_link", "too_many_parents"]);
  });
});

describe("review draft", () => {
  it("is built from the extraction with highlights where the AI was unsure", () => {
    expect(draft.people).toHaveLength(8);
    expect(draft.relationships).toHaveLength(12);
    const arif = byName(draft, "Arif");
    expect(fieldNeedsCheck(arif, "birthDate")).toBe(true); // confidence 0.4
    expect(fieldNeedsCheck(arif, "fullName")).toBe(false);
    expect(personNeedsCheck(byName(draft, "Su?arni"))).toBe(true); // illegible
    expect(draft.relationships.filter(relationshipNeedsCheck)).toHaveLength(3); // 0.6, 0.55, 0.55
  });

  it("editing a field clears its highlight; 'looks right' clears them all", () => {
    const arif = byName(draft, "Arif");
    const edited = updatePerson(draft, arif.id, { birthDate: "1982" });
    expect(fieldNeedsCheck(byName(edited, "Arif"), "birthDate")).toBe(false);
    const suarni = byName(draft, "Su?arni");
    expect(personNeedsCheck(byName(confirmPerson(draft, suarni.id), "Su?arni"))).toBe(false);
  });

  it("removing a person removes their connections", () => {
    const budi = byName(draft, "Budi Santoso");
    const d = removePerson(draft, budi.id);
    expect(d.people).toHaveLength(7);
    expect(d.relationships.some((r) => r.from === budi.id || r.to === budi.id)).toBe(false);
  });

  it("merging two entries keeps one, fills gaps and moves every connection", () => {
    const extra = { ...newDraftPerson("m1", "Budi"), birthPlace: "", notes: "Guru", nicknames: ["Bud"] };
    let d = addPerson(draft, extra);
    const child = byName(d, "Dewi Lestari");
    d = addRelationship(d, { id: "rx", type: "PARENT_CHILD", from: "m1", to: child.id }); // duplicate of Budi→Dewi once merged
    const budi = byName(d, "Budi Santoso");
    d = mergePeople(d, budi.id, "m1");
    const merged = byName(d, "Budi Santoso");
    expect(d.people.find((p) => p.id === "m1")).toBeUndefined();
    expect(merged.nicknames).toEqual(["Bud"]);
    expect(merged.notes).toBe("Guru");
    expect(merged.birthPlace).toBe("Bandung");
    expect(d.relationships.filter((r) => r.from === budi.id && r.to === child.id)).toHaveLength(1);
  });

  it("swaps a parent/child link the wrong way round", () => {
    const r = draft.relationships.find((x) => x.type === "PARENT_CHILD")!;
    const d = swapRelationship(draft, r.id);
    expect(d.relationships.find((x) => x.id === r.id)).toMatchObject({ from: r.to, to: r.from, checked: true });
  });

  it("doesn't ask when birth years are more than five years apart", () => {
    const d = addPerson(draft, { ...newDraftPerson("m3", "Sari"), birthDate: "1985" }); // draft Sari is 1953
    expect(duplicatePrompts(d, [{ id: "e2", fullName: "Rahmat", birthDate: "1990" }])).toEqual([]);
  });

  it("asks 'same person?' for same names, including people already in the tree", () => {
    let d = addPerson(draft, newDraftPerson("m2", "Sari"));
    const prompts = duplicatePrompts(d, [{ id: "e1", fullName: "Rahmat", birthDate: "1955" }]);
    expect(prompts).toEqual([
      { kind: "draft", a: byName(d, "Sari").id, b: "m2" },
      { kind: "existing", a: byName(d, "Rahmat").id, existing: { id: "e1", fullName: "Rahmat", birthDate: "1955" } },
    ]);
    d = dismissPair(d, byName(d, "Sari").id, "m2");
    d = linkExisting(d, byName(d, "Rahmat").id, "e1");
    expect(duplicatePrompts(d, [{ id: "e1", fullName: "Rahmat", birthDate: "1955" }])).toEqual([]);
  });

  it("blocks saving on empty names and on cycles that involve people already in the tree", () => {
    expect(validateDraft(draft)).toEqual([]);
    const hasan = byName(draft, "H. Hasan bin Umar");
    const budi = byName(draft, "Budi Santoso");
    let d = updatePerson(draft, hasan.id, { fullName: "  " });
    expect(validateDraft(d).map((i) => i.code)).toEqual(["empty_name"]);
    // Budi is linked to existing person X, and the tree already says X is Hasan's parent.
    d = linkExisting(draft, budi.id, "X");
    const issues = validateDraft(d, [{ type: "PARENT_CHILD", from: "X", to: hasan.id }]);
    expect(issues.map((i) => i.code)).toEqual(["cycle"]);
    expect(issues[0].people).toContain(budi.id); // reported with draft ids for the UI
  });

  it("produces a payload the server accepts", () => {
    const payload = toImportPayload(draft, [{ key: "pgA", pageIndex: 0, model: "mock", extraction: page }], "import-123456");
    const parsed = importPayloadSchema.parse(payload);
    expect(parsed.people[0]).toMatchObject({ ref: "pgA.p1", pageKey: "pgA", fields: { fullName: "H. Hasan bin Umar", birthDate: "1921" } });
    expect(parsed.people[0].fields.givenName).toBeNull();
  });
});

describe("buildOutline", () => {
  it("nests children under couples and lists unconnected people separately", async () => {
    const { buildOutline } = await import("@/lib/review/outline");
    const d = addPerson(draft, newDraftPerson("m9", "Lone"));
    const { roots, alone } = buildOutline(d);
    const hasan = byName(d, "H. Hasan bin Umar").id;
    const aminah = byName(d, "Hj. Aminah binti Salim").id;
    expect(roots).toHaveLength(1);
    expect(roots[0].people).toEqual([hasan, aminah]);
    expect(roots[0].children.map((c) => c.people.length)).toEqual([2, 1, 1]); // Budi = Su?arni, Sari, Rahmat
    expect(roots[0].children[0].children).toHaveLength(2); // Dewi, Arif
    expect(alone).toEqual(["m9"]);
  });
});
