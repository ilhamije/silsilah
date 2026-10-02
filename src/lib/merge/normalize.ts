/*
 * Name normalisation for cross-tree matching: strip diacritics and titles,
 * map old Indonesian/Malay spellings and common variants to one form, and
 * split off patronymics ("X bin Y").
 */

const TITLES = new Set([
  "h", "hj", "haji", "hajjah", "raden", "r", "rr", "tuan", "puan", "dato",
  "datuk", "bapak", "pak", "ibu", "bu", "mr", "mrs", "dr", "prof", "ir", "drs",
  "dra", "almarhum", "almarhumah", "alm", "almh",
  // academic suffixes, dots removed: s.h. -> sh
  "sh", "se", "sp", "st", "skom", "mm", "mpd", "spd", "msi", "mkom", "ssi",
  "sag", "mag", "mt", "mh", "sos", "ssos",
]);

const VARIANTS: Record<string, string> = {
  mohammad: "muhammad", muhammad: "muhammad", mohamed: "muhammad",
  muhamad: "muhammad", mohamad: "muhammad", mochamad: "muhammad",
  mohd: "muhammad", moh: "muhammad", muh: "muhammad", m: "muhammad",
  abdul: "abdul", abdoel: "abdul", abd: "abdul",
  ahmad: "ahmad", achmad: "ahmad", akhmad: "ahmad",
};

const PATRONYMIC = new Set(["bin", "binti", "bn", "bte", "bt", "ibnu", "ibn"]);

export type NormalizedName = {
  full: string; // title-free, spelling-mapped, without the patronymic part
  given: string;
  family: string; // "" when the name has a single token
  father: string; // "" when no patronymic
};

function mapSpelling(token: string): string {
  const t = token
    .replace(/oe/g, "u")
    .replace(/dj/g, "j")
    .replace(/tj/g, "c")
    .replace(/sj/g, "sy")
    .replace(/nj/g, "ny")
    .replace(/ch/g, "kh");
  return VARIANTS[t] ?? t;
}

function tokens(raw: string): string[] {
  return raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\./g, "") // "s.h." -> "sh", "m." -> "m"
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function normalizeName(raw: string, given?: string | null, family?: string | null): NormalizedName {
  const all = tokens(raw).filter((t) => !TITLES.has(t));
  const split = all.findIndex((t) => PATRONYMIC.has(t));
  const own = (split === -1 ? all : all.slice(0, split)).map(mapSpelling);
  const father = split === -1 ? [] : all.slice(split + 1).map(mapSpelling);
  const g = given ? tokens(given).filter((t) => !TITLES.has(t)).map(mapSpelling) : [];
  const f = family ? tokens(family).filter((t) => !TITLES.has(t)).map(mapSpelling) : [];
  return {
    full: own.join(" "),
    given: g.length ? g.join(" ") : (own[0] ?? ""),
    family: f.length ? f.join(" ") : own.slice(1).join(" "),
    father: father.join(" "),
  };
}
