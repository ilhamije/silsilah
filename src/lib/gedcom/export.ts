/*
 * GEDCOM 5.5.1 export. Pure: people and relationships in, text out.
 * Dates the format can't express ("Mei 1931" is fine, "sekitar zaman perang"
 * is not) go into a NOTE so nothing written on the original chart is lost.
 */

export type GedcomPerson = {
  id: string;
  fullName: string;
  givenName: string | null;
  familyName: string | null;
  nicknames: string[];
  gender: "MALE" | "FEMALE" | "UNKNOWN";
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  notes: string | null;
  isLiving: boolean | null;
};

export type GedcomRelationship = {
  type: "PARENT_CHILD" | "SPOUSE";
  /** Parent, for PARENT_CHILD. */
  personAId: string;
  personBId: string;
};

const MONTHS: Record<string, string> = {
  jan: "JAN", januari: "JAN", january: "JAN",
  feb: "FEB", februari: "FEB", february: "FEB", pebruari: "FEB",
  mar: "MAR", maret: "MAR", march: "MAR",
  apr: "APR", april: "APR",
  mei: "MAY", may: "MAY",
  jun: "JUN", juni: "JUN", june: "JUN",
  jul: "JUL", juli: "JUL", july: "JUL",
  agu: "AUG", agt: "AUG", agustus: "AUG", aug: "AUG", august: "AUG",
  sep: "SEP", sept: "SEP", september: "SEP",
  okt: "OCT", oktober: "OCT", oct: "OCT", october: "OCT",
  nov: "NOV", nop: "NOV", november: "NOV", nopember: "NOV",
  des: "DEC", desember: "DEC", dec: "DEC", december: "DEC",
};
const MONTH_BY_NUMBER = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** The GEDCOM form of a written date, or null when it can't be expressed exactly. */
export function gedcomDate(raw: string | null | undefined): string | null {
  const v = raw?.trim().toLowerCase().replace(/\s+/g, " ");
  if (!v) return null;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{4})$/))) return m[1];
  if ((m = v.match(/^(?:~|ca\.?|c\.|circa|sekitar)\s*(\d{4})$/))) return `ABT ${m[1]}`;
  // Indonesian order: day-month-year.
  if ((m = v.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/))) {
    const month = MONTH_BY_NUMBER[Number(m[2]) - 1];
    return month && Number(m[1]) >= 1 && Number(m[1]) <= 31 ? `${Number(m[1])} ${month} ${m[3]}` : null;
  }
  if ((m = v.match(/^(?:(\d{1,2}) )?([a-z]+)\.? (\d{4})$/))) {
    const month = MONTHS[m[2]];
    if (month) return m[1] ? `${Number(m[1])} ${month} ${m[3]}` : `${month} ${m[3]}`;
  }
  return null;
}

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\//g, "").replace(/\s+/g, " ").trim();

/** One logical line, split into CONT (newlines) and CONC (over 255 characters). */
function lines(level: number, tag: string, value: string): string[] {
  const out: string[] = [];
  const parts = value.replace(/\r\n?/g, "\n").split("\n");
  parts.forEach((part, i) => {
    let first = true;
    let rest = part;
    do {
      const head = i === 0 && first ? `${level} ${tag}` : first ? `${level + 1} CONT` : `${level + 1} CONC`;
      const room = 240 - head.length;
      out.push(rest ? `${head} ${rest.slice(0, room)}` : head);
      rest = rest.slice(room);
      first = false;
    } while (rest);
  });
  return out;
}

export function buildGedcom(
  treeName: string,
  people: GedcomPerson[],
  relationships: GedcomRelationship[],
  now = new Date(),
): string {
  const ids = new Map(people.map((p, i) => [p.id, `@I${i + 1}@`]));
  const known = (id: string) => ids.has(id);

  // Families: one per married pair, plus one per set of parents that have children but no marriage record.
  type Fam = { husb?: string; wife?: string; spouses: [string, string] | null; children: string[] };
  const fams = new Map<string, Fam>();
  const byId = new Map(people.map((p) => [p.id, p]));
  const famOf = (parents: string[]) => {
    const key = [...parents].sort().join("|");
    if (!fams.has(key)) fams.set(key, { spouses: null, children: [] });
    return fams.get(key)!;
  };
  const place = (f: Fam, parents: string[]) => {
    for (const id of parents) {
      const g = byId.get(id)?.gender;
      if (g === "FEMALE" && !f.wife) f.wife = id;
      else if (g === "MALE" && !f.husb) f.husb = id;
      else if (!f.husb) f.husb = id;
      else if (!f.wife && f.husb !== id) f.wife = id;
    }
  };
  for (const r of relationships) {
    if (r.type !== "SPOUSE" || !known(r.personAId) || !known(r.personBId)) continue;
    const f = famOf([r.personAId, r.personBId]);
    f.spouses = [r.personAId, r.personBId];
    place(f, [r.personAId, r.personBId]);
  }
  const parentsOf = new Map<string, string[]>();
  for (const r of relationships) {
    if (r.type !== "PARENT_CHILD" || !known(r.personAId) || !known(r.personBId)) continue;
    parentsOf.set(r.personBId, [...(parentsOf.get(r.personBId) ?? []), r.personAId]);
  }
  for (const [child, parents] of parentsOf) {
    const f = famOf(parents);
    place(f, parents);
    f.children.push(child);
  }
  const famList = [...fams.values()];
  const famIds = new Map(famList.map((f, i) => [f, `@F${i + 1}@`]));
  const asSpouse = new Map<string, string[]>();
  const asChild = new Map<string, string[]>();
  for (const f of famList) {
    for (const p of [f.husb, f.wife]) if (p) asSpouse.set(p, [...(asSpouse.get(p) ?? []), famIds.get(f)!]);
    for (const c of f.children) asChild.set(c, [...(asChild.get(c) ?? []), famIds.get(f)!]);
  }

  const out: string[] = [
    "0 HEAD",
    "1 SOUR Silsilah",
    "2 NAME Silsilah",
    "1 GEDC",
    "2 VERS 5.5.1",
    "2 FORM LINEAGE-LINKED",
    `1 DATE ${now.getUTCDate()} ${MONTH_BY_NUMBER[now.getUTCMonth()]} ${now.getUTCFullYear()}`,
    "1 CHAR UTF-8",
    "1 SUBM @U1@",
    ...lines(1, "NOTE", `Exported from Silsilah: ${clean(treeName)}`),
    "0 @U1@ SUBM",
    "1 NAME Silsilah",
  ];

  for (const p of people) {
    out.push(`0 ${ids.get(p.id)} INDI`);
    const given = p.givenName ? clean(p.givenName) : "";
    const family = p.familyName ? clean(p.familyName) : "";
    out.push(`1 NAME ${given || family ? `${given} /${family}/`.trim() : clean(p.fullName)}`);
    if (given || family) out.push(`2 GIVN ${given}`.trimEnd(), ...(family ? [`2 SURN ${family}`] : []));
    for (const n of p.nicknames) out.push(`2 NICK ${clean(n)}`);
    if (p.gender !== "UNKNOWN") out.push(`1 SEX ${p.gender === "MALE" ? "M" : "F"}`);

    const extra: string[] = [];
    for (const [tag, label, raw, placeText] of [
      ["BIRT", "Born", p.birthDate, p.birthPlace],
      ["DEAT", "Died", p.deathDate, null],
    ] as const) {
      const date = gedcomDate(raw);
      const dead = tag === "DEAT" && !raw && p.isLiving === false;
      if (!date && !placeText && !dead && !raw) continue;
      out.push(`1 ${tag}${dead ? " Y" : ""}`);
      if (date) out.push(`2 DATE ${date}`);
      else if (raw) extra.push(`${label}: ${raw}`);
      if (placeText) out.push(...lines(2, "PLAC", clean(placeText)));
    }
    for (const f of asChild.get(p.id) ?? []) out.push(`1 FAMC ${f}`);
    for (const f of asSpouse.get(p.id) ?? []) out.push(`1 FAMS ${f}`);
    const note = [...extra, p.notes ?? ""].filter(Boolean).join("\n");
    if (note) out.push(...lines(1, "NOTE", note));
  }

  for (const f of famList) {
    out.push(`0 ${famIds.get(f)} FAM`);
    if (f.husb) out.push(`1 HUSB ${ids.get(f.husb)}`);
    if (f.wife) out.push(`1 WIFE ${ids.get(f.wife)}`);
    for (const c of f.children) out.push(`1 CHIL ${ids.get(c)}`);
    if (f.spouses) out.push("1 MARR");
  }
  out.push("0 TRLR");
  return out.join("\r\n") + "\r\n";
}
