import { nameKeyOf } from "@/lib/merge/normalize";

/**
 * Coarse key used to find candidate people across trees with an index lookup:
 * the phonetic key of the first given name (see lib/merge/normalize).
 */
export function nameKey(fullName: string): string {
  return nameKeyOf(fullName);
}
