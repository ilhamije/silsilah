import { newDraftPerson, REVIEW_FIELDS, type ReviewDraft } from "@/lib/review/draft";

/*
 * Starter trees. "scratch" is the smallest: just the user, to build out from
 * with "Add person" and "Add connection". Choosing one when creating a tree opens the review screen
 * with these people and connections already in place; each name is a role
 * ("Father", "First wife"…) highlighted for the user to replace. Nothing is
 * saved until the user presses Save, exactly as with a photographed tree.
 *
 * Pure data: role labels are translated by the caller (messages "templates.roles").
 */

export const TEMPLATE_IDS = ["scratch", "parents-children", "grandparents", "descendants", "nasab", "two-marriages"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const ROLES = [
  "me",
  "father",
  "mother",
  "child1",
  "child2",
  "child3",
  "paternalGrandfather",
  "paternalGrandmother",
  "maternalGrandfather",
  "maternalGrandmother",
  "grandfather",
  "grandmother",
  "child1Spouse",
  "child2Spouse",
  "grandchild1a",
  "grandchild1b",
  "grandchild2a",
  "greatGrandfather",
  "greatGreatGrandfather",
  "husband",
  "firstWife",
  "secondWife",
  "firstMarriageChild1",
  "firstMarriageChild2",
  "secondMarriageChild1",
  "secondMarriageChild2",
] as const;
export type Role = (typeof ROLES)[number];

type Gender = "MALE" | "FEMALE" | "UNKNOWN";

export type Template = {
  id: TemplateId;
  people: { role: Role; gender: Gender }[];
  /** [parent, child] */
  parentChild: [Role, Role][];
  spouses: [Role, Role][];
};

const M = "MALE" as const;
const F = "FEMALE" as const;
const U = "UNKNOWN" as const;

/** Both parents to each child. */
const toChildren = (parents: Role[], children: Role[]): [Role, Role][] =>
  parents.flatMap((p) => children.map((c): [Role, Role] => [p, c]));

export const TEMPLATES: Record<TemplateId, Template> = {
  /** Only the user; everyone else is added by hand. */
  scratch: {
    id: "scratch",
    people: [{ role: "me", gender: U }],
    parentChild: [],
    spouses: [],
  },

  /** A couple and their three children. */
  "parents-children": {
    id: "parents-children",
    people: [
      { role: "father", gender: M },
      { role: "mother", gender: F },
      { role: "child1", gender: U },
      { role: "child2", gender: U },
      { role: "child3", gender: U },
    ],
    parentChild: toChildren(["father", "mother"], ["child1", "child2", "child3"]),
    spouses: [["father", "mother"]],
  },

  /** The user, their parents and all four grandparents. */
  grandparents: {
    id: "grandparents",
    people: [
      { role: "me", gender: U },
      { role: "father", gender: M },
      { role: "mother", gender: F },
      { role: "paternalGrandfather", gender: M },
      { role: "paternalGrandmother", gender: F },
      { role: "maternalGrandfather", gender: M },
      { role: "maternalGrandmother", gender: F },
    ],
    parentChild: [
      ...toChildren(["father", "mother"], ["me"]),
      ...toChildren(["paternalGrandfather", "paternalGrandmother"], ["father"]),
      ...toChildren(["maternalGrandfather", "maternalGrandmother"], ["mother"]),
    ],
    spouses: [
      ["father", "mother"],
      ["paternalGrandfather", "paternalGrandmother"],
      ["maternalGrandfather", "maternalGrandmother"],
    ],
  },

  /** A couple's descendants over three generations (a "keluarga besar" / bani tree). */
  descendants: {
    id: "descendants",
    people: [
      { role: "grandfather", gender: M },
      { role: "grandmother", gender: F },
      { role: "child1", gender: U },
      { role: "child1Spouse", gender: U },
      { role: "child2", gender: U },
      { role: "child2Spouse", gender: U },
      { role: "child3", gender: U },
      { role: "grandchild1a", gender: U },
      { role: "grandchild1b", gender: U },
      { role: "grandchild2a", gender: U },
    ],
    parentChild: [
      ...toChildren(["grandfather", "grandmother"], ["child1", "child2", "child3"]),
      ...toChildren(["child1", "child1Spouse"], ["grandchild1a", "grandchild1b"]),
      ...toChildren(["child2", "child2Spouse"], ["grandchild2a"]),
    ],
    spouses: [
      ["grandfather", "grandmother"],
      ["child1", "child1Spouse"],
      ["child2", "child2Spouse"],
    ],
  },

  /** The father's line over five generations, as in a nasab ("bin … bin …"). */
  nasab: {
    id: "nasab",
    people: [
      { role: "me", gender: U },
      { role: "father", gender: M },
      { role: "grandfather", gender: M },
      { role: "greatGrandfather", gender: M },
      { role: "greatGreatGrandfather", gender: M },
    ],
    parentChild: [
      ["father", "me"],
      ["grandfather", "father"],
      ["greatGrandfather", "grandfather"],
      ["greatGreatGrandfather", "greatGrandfather"],
    ],
    spouses: [],
  },

  /** One man, two marriages and the children of each. */
  "two-marriages": {
    id: "two-marriages",
    people: [
      { role: "husband", gender: M },
      { role: "firstWife", gender: F },
      { role: "secondWife", gender: F },
      { role: "firstMarriageChild1", gender: U },
      { role: "firstMarriageChild2", gender: U },
      { role: "secondMarriageChild1", gender: U },
      { role: "secondMarriageChild2", gender: U },
    ],
    parentChild: [
      ...toChildren(["husband", "firstWife"], ["firstMarriageChild1", "firstMarriageChild2"]),
      ...toChildren(["husband", "secondWife"], ["secondMarriageChild1", "secondMarriageChild2"]),
    ],
    spouses: [
      ["husband", "firstWife"],
      ["husband", "secondWife"],
    ],
  },
};

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === "string" && (TEMPLATE_IDS as readonly string[]).includes(value);
}

export const TEMPLATE_BASIS_PREFIX = "template:";

/**
 * A review draft from a template. Each placeholder name is flagged "please
 * check" (confidence 0) until the user edits or confirms it; everything else
 * counts as already checked, since the user chose the shape themselves.
 */
export function templateDraft(id: TemplateId, label: (role: Role) => string): ReviewDraft {
  const t = TEMPLATES[id];
  const pid = (role: Role) => `t_${role}`;
  return {
    basis: `${TEMPLATE_BASIS_PREFIX}${id}`,
    people: t.people.map(({ role, gender }) => ({
      ...newDraftPerson(pid(role), label(role)),
      gender,
      confidence: { fullName: 0 },
      checked: REVIEW_FIELDS.filter((f) => f !== "fullName"),
    })),
    relationships: [
      ...t.spouses.map(([a, b]) => ({ type: "SPOUSE" as const, from: pid(a), to: pid(b) })),
      ...t.parentChild.map(([parent, child]) => ({ type: "PARENT_CHILD" as const, from: pid(parent), to: pid(child) })),
    ].map((r, i) => ({ ...r, id: `t_r${i}`, confidence: null, checked: true })),
    dismissedPairs: [],
    unclear: [],
  };
}
