/** Person data the tree page sends to the browser (already redacted on the server for Viewers). */
export type TreePerson = {
  id: string;
  fullName: string;
  gender: "MALE" | "FEMALE" | "UNKNOWN";
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  notes: string | null;
  birthYear: number | null;
  deathYear: number | null;
  isLiving: boolean | null;
  livingIsManual: boolean;
  version: number;
  redacted: boolean;
};

export type TreeRelationship = {
  id: string;
  type: "PARENT_CHILD" | "SPOUSE";
  /** Parent, for PARENT_CHILD. */
  personAId: string;
  personBId: string;
  version: number;
};

const ERROR_KEYS: Record<string, string> = {
  version_conflict: "errorConflict",
  too_many_parents: "errorTooManyParents",
  cycle: "errorCycle",
  relationship_exists: "errorExists",
  self_relationship: "errorSelf",
  invalid_person: "errorInvalid",
  person_not_found: "errorGone",
  relationship_not_found: "errorGone",
  suggestion_not_found: "errorGone",
  invalid_suggestion: "errorSuggestion",
  invalid_other_parent: "errorOtherParent",
};

/** A server error code as a sentence in the "tree" messages. */
export function errorMessage(t: (key: string) => string, code: string): string {
  return t(ERROR_KEYS[code] ?? "errorGeneric");
}
