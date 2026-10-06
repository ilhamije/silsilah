export type MergePerson = {
  id: string;
  fullName: string;
  nicknames: string[];
  gender: "MALE" | "FEMALE" | "UNKNOWN";
  birthYear: number | null;
};

/** One tree, as the matcher sees it. parentChild = [parentId, childId]. */
export type MergeTree = {
  id: string;
  people: MergePerson[];
  parentChild: [string, string][];
  spouses: [string, string][];
};

export type ConfirmKind = "ancestor" | "descendant" | "direct" | "spouse";

export type MatchedPair = {
  aId: string;
  bId: string;
  similarity: number;
  /** What confirmed this pair, e.g. "ancestor". */
  kinds: ConfirmKind[];
  /** Generations to the closest confirming link (0 for spouse). */
  distance: number;
  /** Other pairs that confirm this one, as "aId:bId". */
  confirmedBy: string[];
};
