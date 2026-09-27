import { nameKey } from "@/lib/tree/name-key";
import type { KnownPerson } from "./prompt";
import type {
  CombinedPerson,
  ExtractedPerson,
  ExtractedRelationship,
  Extraction,
  FieldConfidence,
} from "./schema";

/*
 * Multi-page trees are read one page per request. Each request is told which
 * people earlier pages found (KNOWN_PEOPLE) so the model can reuse their
 * temp_id. Everything here is pure so it runs in the browser as well as on the
 * server.
 */

/** Valid page scope keys: short, URL-safe, and never containing the "." separator. */
export const PAGE_SCOPE_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;

/**
 * Makes one page's ids globally unique: ids that match KNOWN_PEOPLE are kept
 * (same person as an earlier page), every other id is prefixed with the page's
 * scope key. This stops "p1" on page 2 from colliding with "p1" on page 1.
 * The scope is a stable key per photo (not its position), so removing or
 * reordering pages after reading them can't create duplicate ids.
 */
export function scopePageIds(e: Extraction, scope: string, knownIds: ReadonlySet<string>): Extraction {
  const scoped = (id: string) => `${scope}.${id}`;
  const map = new Map<string, string>();
  for (const p of e.people) {
    map.set(p.temp_id, knownIds.has(p.temp_id) ? p.temp_id : scoped(p.temp_id));
  }
  const id = (x: string) => map.get(x) ?? scoped(x);
  return {
    ...e,
    people: e.people.map((p) => ({ ...p, temp_id: id(p.temp_id) })),
    relationships: e.relationships.map((r) => ({
      ...r,
      from_temp_id: id(r.from_temp_id),
      to_temp_id: id(r.to_temp_id),
    })),
  };
}

export function knownPeopleFrom(people: Pick<CombinedPerson, "temp_id" | "full_name" | "birth_date">[]): KnownPerson[] {
  return people.map(({ temp_id, full_name, birth_date }) => ({ temp_id, full_name, birth_date }));
}

type ScalarField = "given_name" | "family_name" | "birth_date" | "death_date" | "birth_place";
const SCALAR_FIELDS: ScalarField[] = ["given_name", "family_name", "birth_date", "death_date", "birth_place"];

/** Same person seen on two pages: fill gaps, and prefer the more confident reading. */
function mergePerson(a: CombinedPerson, b: ExtractedPerson, pageIndex: number): CombinedPerson {
  const out: CombinedPerson = {
    ...a,
    nicknames: [...new Set([...a.nicknames, ...b.nicknames])],
    illegible: a.illegible && b.illegible,
    notes: [a.notes, b.notes].filter((n, i, all) => n && all.indexOf(n) === i).join("; ") || null,
    pages: [...new Set([...a.pages, pageIndex])].sort((x, y) => x - y),
    field_confidence: { ...a.field_confidence },
  };
  const conf = (p: { field_confidence: FieldConfidence }, f: keyof FieldConfidence) => p.field_confidence[f] ?? 0;

  if (a.illegible && !b.illegible) {
    out.full_name = b.full_name;
    out.field_confidence.full_name = b.field_confidence.full_name;
  }
  for (const f of SCALAR_FIELDS) {
    if (b[f] && (!a[f] || conf(b, f) > conf(a, f))) {
      out[f] = b[f];
      out.field_confidence[f] = b.field_confidence[f];
    }
  }
  if (a.gender === "unknown" && b.gender !== "unknown") {
    out.gender = b.gender;
    out.field_confidence.gender = b.field_confidence.gender;
  }
  return out;
}

function relKey(r: ExtractedRelationship) {
  const [x, y] =
    r.type === "spouse" && r.to_temp_id < r.from_temp_id
      ? [r.to_temp_id, r.from_temp_id]
      : [r.from_temp_id, r.to_temp_id];
  return `${r.type}|${x}|${y}`;
}

export type PageResult = { pageIndex: number; extraction: Extraction };

export type CombinedExtraction = {
  people: CombinedPerson[];
  relationships: ExtractedRelationship[];
  unclearItems: { page: number; text: string }[];
  /** Different ids with the same normalized name: the review screen asks "same person?". */
  possibleDuplicates: [string, string][];
  languages: string[];
  confidence: number;
};

/** Combines already id-scoped page results (see scopePageIds) in page order. */
export function combinePages(pages: PageResult[]): CombinedExtraction {
  const people = new Map<string, CombinedPerson>();
  const rels = new Map<string, ExtractedRelationship>();
  const unclearItems: CombinedExtraction["unclearItems"] = [];

  for (const { pageIndex, extraction } of [...pages].sort((a, b) => a.pageIndex - b.pageIndex)) {
    for (const p of extraction.people) {
      const existing = people.get(p.temp_id);
      people.set(p.temp_id, existing ? mergePerson(existing, p, pageIndex) : { ...p, pages: [pageIndex] });
    }
    for (const r of extraction.relationships) {
      const key = relKey(r);
      const existing = rels.get(key);
      if (!existing || r.confidence > existing.confidence) rels.set(key, r);
    }
    for (const text of extraction.unclear_items) unclearItems.push({ page: pageIndex, text });
  }

  const list = [...people.values()];
  const byKey = new Map<string, string[]>();
  for (const p of list) {
    if (p.illegible) continue;
    const key = nameKey(p.full_name);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), p.temp_id]);
  }
  const possibleDuplicates: [string, string][] = [];
  for (const ids of byKey.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) possibleDuplicates.push([ids[i], ids[j]]);
    }
  }

  const confidences = pages.map((p) => p.extraction.confidence);
  return {
    people: list,
    relationships: [...rels.values()],
    unclearItems,
    possibleDuplicates,
    languages: [...new Set(pages.map((p) => p.extraction.language_detected))],
    confidence: confidences.length ? Math.min(...confidences) : 0,
  };
}
