import { describe, expect, it } from "vitest";
import { buildGedcom, gedcomDate, type GedcomPerson } from "@/lib/gedcom/export";

const p = (id: string, fullName: string, extra: Partial<GedcomPerson> = {}): GedcomPerson => ({
  id, fullName, givenName: null, familyName: null, nicknames: [], gender: "UNKNOWN",
  birthDate: null, deathDate: null, birthPlace: null, notes: null, isLiving: null, ...extra,
});

describe("gedcomDate", () => {
  it.each([
    ["1952", "1952"],
    ["~1950", "ABT 1950"],
    ["ca. 1890", "ABT 1890"],
    ["Mei 1931", "MAY 1931"],
    ["12 Agustus 1945", "12 AUG 1945"],
    ["12-5-1931", "12 MAY 1931"],
    ["17/08/1945", "17 AUG 1945"],
  ])("%s → %s", (raw, out) => expect(gedcomDate(raw)).toBe(out));
  it.each(["zaman perang", "", null, "1950an", "31-13-1950"])("%s can't be expressed", (raw) =>
    expect(gedcomDate(raw)).toBeNull());
});

describe("buildGedcom", () => {
  const people = [
    p("h", "Hasan Basri", { gender: "MALE", birthDate: "1920", deathDate: "1990" }),
    p("s", "Siti Aminah", { gender: "FEMALE", birthDate: "Mei 1925", isLiving: false }),
    p("r", "Rahmat Hasan", { givenName: "Rahmat", familyName: "Hasan", gender: "MALE", nicknames: ["Mamat"], birthPlace: "Bandung", birthDate: "zaman perang" }),
    p("o", "Orphan / Test", { notes: "line one\nline two" }),
  ];
  const text = buildGedcom("Keluarga Hasan", people, [
    { type: "SPOUSE", personAId: "h", personBId: "s" },
    { type: "PARENT_CHILD", personAId: "h", personBId: "r" },
    { type: "PARENT_CHILD", personAId: "s", personBId: "r" },
  ], new Date("2026-10-07T00:00:00Z"));
  const lines = text.split("\r\n");

  it("has a valid header and trailer", () => {
    expect(lines[0]).toBe("0 HEAD");
    expect(text).toContain("2 VERS 5.5.1");
    expect(text).toContain("1 DATE 7 OCT 2026");
    expect(lines.at(-2)).toBe("0 TRLR");
  });
  it("writes names, sex, dates and places", () => {
    expect(text).toContain("1 NAME Rahmat /Hasan/");
    expect(text).toContain("2 NICK Mamat");
    expect(text).toContain("1 SEX F");
    expect(text).toContain("2 DATE MAY 1925");
    expect(text).toContain("2 PLAC Bandung");
  });
  it("keeps dates it can't express in a note, and marks known deaths", () => {
    expect(text).toContain("1 NOTE Born: zaman perang");
    expect(text).toMatch(/1 DEAT Y/);
  });
  it("strips slashes from names and splits multi-line notes", () => {
    expect(text).toContain("1 NAME Orphan  Test".replace("  ", " "));
    expect(text).toContain("1 NOTE line one\r\n2 CONT line two");
  });
  it("links the couple and child through one family", () => {
    const fam = text.split("0 @F1@ FAM")[1].split("0 ")[0];
    expect(fam).toContain("1 HUSB @I1@");
    expect(fam).toContain("1 WIFE @I2@");
    expect(fam).toContain("1 CHIL @I3@");
    expect(fam).toContain("1 MARR");
    expect(text).toContain("1 FAMC @F1@");
    expect(text).toContain("1 FAMS @F1@");
  });
  it("makes a family for a lone parent and never emits two for one couple", () => {
    const t = buildGedcom("x", [p("a", "A", { gender: "MALE" }), p("b", "B")], [{ type: "PARENT_CHILD", personAId: "a", personBId: "b" }]);
    expect(t.match(/ FAM\r\n/g)).toHaveLength(1);
    expect(t).toContain("1 HUSB @I1@");
  });
  it("keeps every line within 255 characters", () => {
    const long = buildGedcom("x", [p("a", "A", { notes: "x".repeat(1000) })], []);
    expect(long.split("\r\n").every((l) => l.length <= 255)).toBe(true);
    expect(long.replace(/\r\n2 CONC /g, "")).toContain("x".repeat(1000));
  });
  it("ignores relationships to people not in the export", () => {
    const t = buildGedcom("x", [p("a", "A")], [{ type: "PARENT_CHILD", personAId: "ghost", personBId: "a" }]);
    expect(t).not.toContain("FAM");
  });
});
