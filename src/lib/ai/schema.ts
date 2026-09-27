import { z } from "zod";
import type { Locale } from "@/i18n/config";

/*
 * The extraction contract. This one Zod schema is used three ways:
 *  1. sent to the API as the structured-output format (so the model can only
 *     answer in this shape),
 *  2. to validate the parsed answer again on our side, and
 *  3. as the TypeScript types for the rest of the app.
 *
 * Structured outputs don't support open-ended maps or numeric bounds, so
 * `field_confidence` is a fixed object and confidences are clamped to 0..1
 * afterwards in normalizeExtraction().
 */

const confidence = z.number();

export const fieldConfidenceSchema = z.object({
  full_name: confidence.nullable(),
  given_name: confidence.nullable(),
  family_name: confidence.nullable(),
  gender: confidence.nullable(),
  birth_date: confidence.nullable(),
  death_date: confidence.nullable(),
  birth_place: confidence.nullable(),
});

export const extractedPersonSchema = z.object({
  temp_id: z.string(),
  full_name: z.string(),
  given_name: z.string().nullable(),
  family_name: z.string().nullable(),
  nicknames: z.array(z.string()),
  gender: z.enum(["male", "female", "unknown"]),
  birth_date: z.string().nullable(),
  death_date: z.string().nullable(),
  birth_place: z.string().nullable(),
  notes: z.string().nullable(),
  field_confidence: fieldConfidenceSchema,
  illegible: z.boolean(),
  // Approximate box around the name, [x, y, width, height] as fractions of the image.
  bbox: z.array(z.number()).nullable(),
});

export const extractedRelationshipSchema = z.object({
  type: z.enum(["parent_child", "spouse"]),
  from_temp_id: z.string(), // parent, for parent_child
  to_temp_id: z.string(), // child, for parent_child
  confidence,
});

export const extractionSchema = z.object({
  is_family_tree: z.boolean(),
  rejection_reason: z.string().nullable(),
  confidence,
  language_detected: z.string(),
  people: z.array(extractedPersonSchema),
  relationships: z.array(extractedRelationshipSchema),
  unclear_items: z.array(z.string()),
});

export type FieldConfidence = z.infer<typeof fieldConfidenceSchema>;
export type ExtractedPerson = z.infer<typeof extractedPersonSchema>;
export type ExtractedRelationship = z.infer<typeof extractedRelationshipSchema>;
export type Extraction = z.infer<typeof extractionSchema>;

/** A person after multi-page combining: remembers which page(s) they came from. */
export type CombinedPerson = ExtractedPerson & { pages: number[] };

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const blankToNull = (s: string | null) => (s && s.trim() ? s.trim() : null);

/** Clamp numbers, trim strings, drop empty entries, and fix malformed boxes. */
const danglingLinkNote: Record<Locale, string> = {
  en: "A line on this page points to someone we couldn't find; please check the connections.",
  id: "Ada garis di halaman ini yang menunjuk ke orang yang tidak kami temukan; mohon periksa hubungannya.",
};

export function normalizeExtraction(e: Extraction, locale: Locale = "en"): Extraction {
  const people = e.people
    .filter((p) => p.temp_id.trim() && (p.full_name.trim() || p.illegible))
    .map((p) => ({
      ...p,
      temp_id: p.temp_id.trim(),
      full_name: p.full_name.trim() || "?",
      given_name: blankToNull(p.given_name),
      family_name: blankToNull(p.family_name),
      nicknames: [...new Set(p.nicknames.map((n) => n.trim()).filter(Boolean))],
      birth_date: blankToNull(p.birth_date),
      death_date: blankToNull(p.death_date),
      birth_place: blankToNull(p.birth_place),
      notes: blankToNull(p.notes),
      field_confidence: Object.fromEntries(
        Object.entries(p.field_confidence).map(([k, v]) => [k, v == null ? null : clamp01(v)]),
      ) as FieldConfidence,
      bbox:
        p.bbox && p.bbox.length === 4 && p.bbox.every((n) => Number.isFinite(n))
          ? p.bbox.map(clamp01)
          : null,
    }));
  const ids = new Set(people.map((p) => p.temp_id));
  const unclear = e.unclear_items.map((s) => s.trim()).filter(Boolean);
  const linked = e.relationships.filter((r) => r.from_temp_id !== r.to_temp_id);
  const relationships = linked
    .filter((r) => ids.has(r.from_temp_id) && ids.has(r.to_temp_id))
    .map((r) => ({ ...r, confidence: clamp01(r.confidence) }));
  if (relationships.length < linked.length) unclear.push(danglingLinkNote[locale]);
  return {
    ...e,
    rejection_reason: blankToNull(e.rejection_reason),
    confidence: clamp01(e.confidence),
    language_detected: e.language_detected.trim() || "und",
    people,
    relationships,
    unclear_items: unclear,
  };
}
