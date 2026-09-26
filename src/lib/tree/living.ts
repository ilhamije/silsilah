import { parseYear } from "./dates";

/** A person born more than this many years ago is presumed deceased. */
export const PRESUMED_DECEASED_AFTER_YEARS = 100;

const DECEASED_MARKERS =
  /†|\balm(h)?\.|\balmarhum(ah)?\b|\bwafat\b|\bmeninggal\b|\bdeceased\b|\(late\)|\bd\.\s*\d/i;

export type LivingInput = {
  fullName?: string | null;
  birthDate?: string | null;
  birthYear?: number | null;
  deathDate?: string | null;
  deathYear?: number | null;
  notes?: string | null;
  isLiving?: boolean | null;
  livingIsManual?: boolean;
};

/**
 * true = living, false = deceased, null = unknown. Unknown is treated as
 * living wherever privacy is concerned. A manual override always wins.
 */
export function inferLiving(p: LivingInput, now: Date = new Date()): boolean | null {
  if (p.livingIsManual) return p.isLiving ?? null;
  if (p.deathDate?.trim() || p.deathYear) return false;
  if (DECEASED_MARKERS.test(p.notes ?? "") || DECEASED_MARKERS.test(p.fullName ?? "")) {
    return false;
  }
  const birthYear = p.birthYear ?? parseYear(p.birthDate);
  if (birthYear == null) return null;
  return now.getFullYear() - birthYear <= PRESUMED_DECEASED_AFTER_YEARS;
}

/** Privacy view: unknown counts as living. */
export function treatAsLiving(isLiving: boolean | null | undefined): boolean {
  return isLiving !== false;
}
