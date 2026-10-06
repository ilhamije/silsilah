/** Every merge-detection threshold lives here, so tuning never touches logic. */
export const mergeConfig = {
  /** Jaro-Winkler on the normalized full name at or above this is a name match. */
  nameSimilarity: 0.88,
  /** Both birth years known and further apart than this: not the same person. */
  maxBirthYearGap: 5,
  /** Confirmed pairs needed before a suggestion is created. */
  minConfirmedPairs: 2,
  /** Common ancestor: how many generations up we look. */
  maxAncestorDistance: 3,
  /** Common descendant: how many generations down we look. */
  maxDescendantDistance: 2,
  /** A matched parent/grandparent and child counts on its own. 0 = strict rule. */
  directLinkMaxDepth: 2,
  /** Married in both trees counts as a link. Weak evidence, so off by default. */
  allowSpouseLink: false,
  /** Weight of a confirming link by generation distance (1 = parent/child/sibling). */
  weights: { 1: 1.0, 2: 0.7, 3: 0.5 } as Record<number, number>,
  spouseWeight: 0.6,
  bands: { high: 4.0, medium: 2.5 },
  /** A rejected pair of trees is suggested again only with this many new pairs. */
  resuggestMinNewPairs: 2,
  honorifics: [
    "h", "hj", "haji", "hajjah", "raden", "r", "rr", "tuan", "puan", "dato", "datuk",
    "bapak", "pak", "ibu", "bu", "mr", "mrs", "dr", "prof", "ir", "drs", "dra",
    "sh", "se", "st", "spd", "mm", "msi", "ssi", "skom", "mpd", "mt",
  ],
  /** Spelling variants mapped to one canonical token. */
  variants: {
    mohammad: "muhammad", mohamed: "muhammad", mohammed: "muhammad", muhamad: "muhammad",
    mochammad: "muhammad", moh: "muhammad", mhd: "muhammad", m: "muhammad",
    ahmad: "ahmad", achmad: "ahmad", akhmad: "ahmad",
    abdul: "abdul", abdoel: "abdul", abd: "abdul",
  } as Record<string, string>,
  /** Old Indonesian/Malay spellings, applied in order. */
  spellings: [
    ["oe", "u"], ["dj", "j"], ["tj", "c"], ["sj", "sy"], ["nj", "ny"], ["ch", "kh"],
  ] as [string, string][],
};

export type MergeConfig = typeof mergeConfig;
