/**
 * Coarse key used to find candidate people across trees with an index lookup.
 * Phase 5 replaces the body with the full normalizer from lib/merge; the
 * column and index are in place from the start.
 */
export function nameKey(fullName: string): string {
  return fullName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
