import type { CombinedExtraction } from "@/lib/ai/combine";
import { extractionThresholds } from "@/lib/ai/classify";
import type { Extraction } from "@/lib/ai/schema";
import type { ImportPayloadInput } from "@/lib/import/schema";
import { checkGraph, type Edge, type GraphIssue } from "@/lib/tree/graph";
import { nameKey } from "@/lib/tree/name-key";
import { parseYear } from "@/lib/tree/dates";

/*
 * The review screen's working copy. Built once from the combined extraction,
 * then changed only through the pure operations below, and autosaved in the
 * browser. Nothing reaches the database until toImportPayload() is confirmed.
 */

export const REVIEW_FIELDS = [
  "fullName",
  "givenName",
  "familyName",
  "gender",
  "birthDate",
  "deathDate",
  "birthPlace",
] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];

export type DraftPerson = {
  id: string;
  fullName: string;
  givenName: string;
  familyName: string;
  nicknames: string[];
  gender: "MALE" | "FEMALE" | "UNKNOWN";
  birthDate: string;
  deathDate: string;
  birthPlace: string;
  notes: string;
  /** null = work it out from the dates; true/false = set by the user. */
  livingOverride: boolean | null;
  illegible: boolean;
  confidence: Partial<Record<ReviewField, number | null>>;
  /** Fields the user edited or confirmed; they no longer need a highlight. */
  checked: ReviewField[];
  /** Page positions this person was read from (empty if added by hand). */
  pages: number[];
  bbox: number[] | null;
  /** Linked to a person who is already in the tree: they won't be created again. */
  existingId: string | null;
};

export type DraftRelationship = {
  id: string;
  type: "PARENT_CHILD" | "SPOUSE";
  from: string; // parent, for PARENT_CHILD
  to: string;
  confidence: number | null; // null = added by the user
  checked: boolean;
};

export type ReviewDraft = {
  /** Identifies the page results this draft was built from; a change means rebuild. */
  basis: string;
  people: DraftPerson[];
  relationships: DraftRelationship[];
  /** "Different people" answers to possible-duplicate prompts, as pair keys. */
  dismissedPairs: string[];
  unclear: { page: number; text: string }[];
};

export type ExistingPerson = { id: string; fullName: string; birthDate: string | null };

const FIELD_FROM_AI: Record<ReviewField, keyof Extraction["people"][number]["field_confidence"]> = {
  fullName: "full_name",
  givenName: "given_name",
  familyName: "family_name",
  gender: "gender",
  birthDate: "birth_date",
  deathDate: "death_date",
  birthPlace: "birth_place",
};

const genderFromAI = { male: "MALE", female: "FEMALE", unknown: "UNKNOWN" } as const;

export function buildDraft(combined: CombinedExtraction, basis: string): ReviewDraft {
  return {
    basis,
    people: combined.people.map((p) => ({
      id: p.temp_id,
      fullName: p.full_name,
      givenName: p.given_name ?? "",
      familyName: p.family_name ?? "",
      nicknames: p.nicknames,
      gender: genderFromAI[p.gender],
      birthDate: p.birth_date ?? "",
      deathDate: p.death_date ?? "",
      birthPlace: p.birth_place ?? "",
      notes: p.notes ?? "",
      livingOverride: null,
      illegible: p.illegible,
      confidence: Object.fromEntries(REVIEW_FIELDS.map((f) => [f, p.field_confidence[FIELD_FROM_AI[f]]])),
      checked: [],
      pages: p.pages,
      bbox: p.bbox,
      existingId: null,
    })),
    relationships: combined.relationships.map((r, i) => ({
      id: `r${i + 1}`,
      type: r.type === "parent_child" ? "PARENT_CHILD" : "SPOUSE",
      from: r.from_temp_id,
      to: r.to_temp_id,
      confidence: r.confidence,
      checked: false,
    })),
    dismissedPairs: [],
    unclear: combined.unclearItems,
  };
}

// ─── What needs attention ────────────────────────────────────────────────

const LOW = extractionThresholds.reviewFieldConfidence;

export function fieldNeedsCheck(p: DraftPerson, f: ReviewField): boolean {
  if (p.checked.includes(f)) return false;
  if (f === "fullName" && p.illegible) return true;
  const c = p.confidence[f];
  return c != null && c < LOW;
}

export const personNeedsCheck = (p: DraftPerson) => REVIEW_FIELDS.some((f) => fieldNeedsCheck(p, f));

export const relationshipNeedsCheck = (r: DraftRelationship) =>
  !r.checked && r.confidence != null && r.confidence < LOW;

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export type DuplicatePrompt =
  | { kind: "draft"; a: string; b: string }
  | { kind: "existing"; a: string; existing: ExistingPerson };

/** Birth years further apart than this mean "not the same person" (same rule as tree merging). */
export const MAX_BIRTH_YEAR_GAP = 5;

function birthYearsConflict(a: string | null | undefined, b: string | null | undefined) {
  const x = parseYear(a);
  const y = parseYear(b);
  return x != null && y != null && Math.abs(x - y) > MAX_BIRTH_YEAR_GAP;
}

/** Same normalized name, compatible birth years, not yet answered: ask "same person?". */
export function duplicatePrompts(d: ReviewDraft, existing: ExistingPerson[]): DuplicatePrompt[] {
  const out: DuplicatePrompt[] = [];
  const keyed = d.people.filter((p) => !p.illegible).map((p) => ({ p, key: nameKey(p.fullName) }));
  for (let i = 0; i < keyed.length; i++) {
    for (let j = i + 1; j < keyed.length; j++) {
      const { p: a, key } = keyed[i];
      const b = keyed[j].p;
      if (
        key &&
        key === keyed[j].key &&
        !birthYearsConflict(a.birthDate, b.birthDate) &&
        !d.dismissedPairs.includes(pairKey(a.id, b.id))
      ) {
        out.push({ kind: "draft", a: a.id, b: b.id });
      }
    }
  }
  const existingByKey = new Map<string, ExistingPerson[]>();
  for (const e of existing) {
    const k = nameKey(e.fullName);
    existingByKey.set(k, [...(existingByKey.get(k) ?? []), e]);
  }
  for (const { p, key } of keyed) {
    if (p.existingId) continue;
    for (const e of existingByKey.get(key) ?? []) {
      if (!birthYearsConflict(p.birthDate, e.birthDate) && !d.dismissedPairs.includes(pairKey(p.id, `existing:${e.id}`))) {
        out.push({ kind: "existing", a: p.id, existing: e });
      }
    }
  }
  return out;
}

// ─── Operations (all pure) ───────────────────────────────────────────────

type PersonPatch = Partial<Omit<DraftPerson, "id" | "confidence" | "checked" | "pages" | "bbox">>;

export function updatePerson(d: ReviewDraft, id: string, patch: PersonPatch): ReviewDraft {
  const touched = REVIEW_FIELDS.filter((f) => f in patch);
  return {
    ...d,
    people: d.people.map((p) =>
      p.id === id
        ? {
            ...p,
            ...patch,
            illegible: "fullName" in patch ? false : p.illegible,
            checked: [...new Set([...p.checked, ...touched])],
          }
        : p,
    ),
  };
}

/** "Looks right": clears every highlight on this person. */
export function confirmPerson(d: ReviewDraft, id: string): ReviewDraft {
  return {
    ...d,
    people: d.people.map((p) => (p.id === id ? { ...p, illegible: false, checked: [...REVIEW_FIELDS] } : p)),
  };
}

export function newDraftPerson(id: string, fullName = ""): DraftPerson {
  return {
    id,
    fullName,
    givenName: "",
    familyName: "",
    nicknames: [],
    gender: "UNKNOWN",
    birthDate: "",
    deathDate: "",
    birthPlace: "",
    notes: "",
    livingOverride: null,
    illegible: false,
    confidence: {},
    checked: [...REVIEW_FIELDS],
    pages: [],
    bbox: null,
    existingId: null,
  };
}

export function addPerson(d: ReviewDraft, person: DraftPerson): ReviewDraft {
  return { ...d, people: [...d.people, person] };
}

export function removePerson(d: ReviewDraft, id: string): ReviewDraft {
  return {
    ...d,
    people: d.people.filter((p) => p.id !== id),
    relationships: d.relationships.filter((r) => r.from !== id && r.to !== id),
  };
}

const relKey = (r: Pick<DraftRelationship, "type" | "from" | "to">) =>
  r.type === "SPOUSE" ? `S|${pairKey(r.from, r.to)}` : `P|${r.from}|${r.to}`;

/** Drops self-links and duplicates, keeping the first (or a checked) copy. */
function tidyRelationships(rels: DraftRelationship[]): DraftRelationship[] {
  const seen = new Map<string, DraftRelationship>();
  for (const r of rels) {
    if (r.from === r.to) continue;
    const k = relKey(r);
    const prev = seen.get(k);
    if (!prev) seen.set(k, r);
    else if (r.checked && !prev.checked) seen.set(k, { ...prev, checked: true });
  }
  return [...seen.values()];
}

/** The two entries are one person: keep `keepId`, fill its gaps from `dropId`, move the links. */
export function mergePeople(d: ReviewDraft, keepId: string, dropId: string): ReviewDraft {
  const keep = d.people.find((p) => p.id === keepId);
  const drop = d.people.find((p) => p.id === dropId);
  if (!keep || !drop || keepId === dropId) return d;
  const text = ["fullName", "givenName", "familyName", "birthDate", "deathDate", "birthPlace"] as const;
  const merged: DraftPerson = { ...keep };
  for (const f of text) {
    if (!merged[f].trim() && drop[f].trim()) {
      merged[f] = drop[f];
      merged.confidence = { ...merged.confidence, [f]: drop.confidence[f] ?? null };
    }
  }
  if (merged.gender === "UNKNOWN") merged.gender = drop.gender;
  merged.nicknames = [...new Set([...keep.nicknames, ...drop.nicknames])];
  merged.notes = [keep.notes, drop.notes].filter((n, i, all) => n.trim() && all.indexOf(n) === i).join("; ");
  merged.pages = [...new Set([...keep.pages, ...drop.pages])].sort((a, b) => a - b);
  merged.bbox = keep.bbox ?? drop.bbox;
  merged.existingId = keep.existingId ?? drop.existingId;
  merged.illegible = keep.illegible && drop.illegible;
  merged.livingOverride = keep.livingOverride ?? drop.livingOverride;

  const swap = (id: string) => (id === dropId ? keepId : id);
  return {
    ...d,
    people: d.people.filter((p) => p.id !== dropId).map((p) => (p.id === keepId ? merged : p)),
    relationships: tidyRelationships(d.relationships.map((r) => ({ ...r, from: swap(r.from), to: swap(r.to) }))),
    dismissedPairs: d.dismissedPairs,
  };
}

/** Link a draft person to someone already in the tree (or unlink with null). */
export function linkExisting(d: ReviewDraft, id: string, existingId: string | null): ReviewDraft {
  return { ...d, people: d.people.map((p) => (p.id === id ? { ...p, existingId } : p)) };
}

export function dismissPair(d: ReviewDraft, a: string, b: string): ReviewDraft {
  const k = pairKey(a, b);
  return d.dismissedPairs.includes(k) ? d : { ...d, dismissedPairs: [...d.dismissedPairs, k] };
}

export function addRelationship(d: ReviewDraft, rel: Omit<DraftRelationship, "confidence" | "checked">): ReviewDraft {
  if (rel.from === rel.to || d.relationships.some((r) => relKey(r) === relKey(rel))) return d;
  return { ...d, relationships: [...d.relationships, { ...rel, confidence: null, checked: true }] };
}

export function removeRelationship(d: ReviewDraft, id: string): ReviewDraft {
  return { ...d, relationships: d.relationships.filter((r) => r.id !== id) };
}

/** Parent and child the wrong way round. */
export function swapRelationship(d: ReviewDraft, id: string): ReviewDraft {
  return {
    ...d,
    relationships: tidyRelationships(
      d.relationships.map((r) => (r.id === id ? { ...r, from: r.to, to: r.from, checked: true } : r)),
    ),
  };
}

export function confirmRelationship(d: ReviewDraft, id: string): ReviewDraft {
  return { ...d, relationships: d.relationships.map((r) => (r.id === id ? { ...r, checked: true } : r)) };
}

// ─── Validation and saving ───────────────────────────────────────────────

export type DraftIssue = GraphIssue | { code: "empty_name"; people: [string] } | { code: "no_people"; people: [] };

/** Problems that block saving. `existingEdges` are the tree's current parent/spouse links. */
export function validateDraft(d: ReviewDraft, existingEdges: Edge[] = []): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (d.people.length === 0) issues.push({ code: "no_people", people: [] });
  for (const p of d.people) {
    if (!p.existingId && !p.fullName.trim()) issues.push({ code: "empty_name", people: [p.id] });
  }
  // Check in terms of real identities, so links to existing people count.
  const node = new Map(d.people.map((p) => [p.id, p.existingId ?? p.id]));
  const back = new Map(d.people.map((p) => [p.existingId ?? p.id, p.id]));
  const edges: Edge[] = [
    ...existingEdges,
    ...d.relationships.map((r) => ({ type: r.type, from: node.get(r.from) ?? r.from, to: node.get(r.to) ?? r.to })),
  ];
  for (const issue of checkGraph(edges)) {
    issues.push({ ...issue, people: issue.people.map((id) => back.get(id) ?? id) } as GraphIssue);
  }
  return issues;
}

export type PageForImport = { key: string; pageIndex: number; model: string | null; extraction: Extraction };

const blank = (s: string) => (s.trim() ? s.trim() : null);

export function toImportPayload(d: ReviewDraft, pages: PageForImport[], importId: string): ImportPayloadInput {
  const keyAt = new Map(pages.map((p) => [p.pageIndex, p.key]));
  return {
    importId,
    pages,
    people: d.people.map((p) => ({
      ref: p.id,
      existingId: p.existingId,
      fields: {
        fullName: p.fullName.trim() || "?",
        givenName: blank(p.givenName),
        familyName: blank(p.familyName),
        nicknames: p.nicknames.map((n) => n.trim()).filter(Boolean),
        gender: p.gender,
        birthDate: blank(p.birthDate),
        deathDate: blank(p.deathDate),
        birthPlace: blank(p.birthPlace),
        notes: blank(p.notes),
        livingOverride: p.livingOverride,
      },
      pageKey: p.pages.length ? (keyAt.get(p.pages[0]) ?? null) : null,
      bbox: p.bbox && p.bbox.length === 4 ? p.bbox : null,
    })),
    relationships: d.relationships.map(({ type, from, to }) => ({ type, from, to })),
  };
}
