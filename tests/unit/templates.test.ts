import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { importPayloadSchema } from "@/lib/import/schema";
import { fieldNeedsCheck, personNeedsCheck, SELF_REF, toImportPayload, validateDraft } from "@/lib/review/draft";
import { isTemplateId, ROLES, TEMPLATE_IDS, TEMPLATES, templateDraft } from "@/lib/tree/templates";

const label = (role: string) => `Label ${role}`;

describe("tree templates", () => {
  it.each(TEMPLATE_IDS)("%s builds a valid, saveable draft", (id) => {
    const draft = templateDraft(id, label);
    expect(validateDraft(draft)).toEqual([]);

    const ids = new Set(draft.people.map((p) => p.id));
    expect(ids.size).toBe(draft.people.length);
    for (const r of draft.relationships) {
      expect(ids.has(r.from) && ids.has(r.to)).toBe(true);
    }

    const payload = toImportPayload(draft, [], "imp_templatetest");
    expect(importPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("sends the template's Me as the user's own person, and nothing when Me was removed", () => {
    const draft = templateDraft("grandparents", label);
    expect(toImportPayload(draft, [], "imp_selftest1").selfRef).toBe(SELF_REF);
    const withoutMe = { ...draft, people: draft.people.filter((p) => p.id !== SELF_REF), relationships: [] };
    expect(toImportPayload(withoutMe, [], "imp_selftest2").selfRef).toBeNull();
  });

  it("flags every placeholder name for checking, and nothing else", () => {
    const draft = templateDraft("descendants", label);
    for (const p of draft.people) {
      expect(fieldNeedsCheck(p, "fullName")).toBe(true);
      expect(fieldNeedsCheck(p, "birthDate")).toBe(false);
    }
    expect(draft.relationships.every((r) => r.checked)).toBe(true);
    expect(draft.people.every(personNeedsCheck)).toBe(true);
  });

  it("uses the given labels for names", () => {
    const draft = templateDraft("nasab", label);
    expect(draft.people.map((p) => p.fullName)).toContain("Label greatGreatGrandfather");
  });

  it("has English labels for every role and template", () => {
    for (const role of ROLES) expect(en.templates.roles[role]).toBeTruthy();
    for (const id of TEMPLATE_IDS) expect(en.templates.options[id].title).toBeTruthy();
  });

  it("only uses roles that exist", () => {
    for (const t of Object.values(TEMPLATES)) {
      const roles = new Set(t.people.map((p) => p.role));
      for (const [a, b] of [...t.parentChild, ...t.spouses]) expect(roles.has(a) && roles.has(b)).toBe(true);
    }
  });

  it("recognises template ids", () => {
    expect(isTemplateId("nasab")).toBe(true);
    expect(isTemplateId("scratch")).toBe(true);
    expect(isTemplateId("../x")).toBe(false);
    expect(isTemplateId(undefined)).toBe(false);
  });
});
