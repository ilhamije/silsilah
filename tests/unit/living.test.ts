import { describe, expect, it } from "vitest";
import { parseYear } from "@/lib/tree/dates";
import { inferLiving, treatAsLiving } from "@/lib/tree/living";
import { redactPerson } from "@/lib/tree/redact";

const now = new Date("2026-09-26");

describe("parseYear", () => {
  it.each([
    ["1952", 1952],
    ["~1950", 1950],
    ["ca. 1890", 1890],
    ["12-5-1931", 1931],
    ["Mei 1931", 1931],
    ["1950an", 1950],
    ["12-5-31", null],
    ["", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parseYear(input)).toBe(expected);
  });
});

describe("inferLiving", () => {
  it("death date means deceased", () => {
    expect(inferLiving({ deathDate: "1999" }, now)).toBe(false);
  });
  it.each(["†", "alm.", "Almarhumah", "wafat 1990", "(late)", "d. 1980"])(
    "marker %s in notes means deceased",
    (notes) => expect(inferLiving({ notes }, now)).toBe(false),
  );
  it("Alm. prefix on the name means deceased", () => {
    expect(inferLiving({ fullName: "Alm. H. Hasan" }, now)).toBe(false);
  });
  it("born within 100 years means living", () => {
    expect(inferLiving({ birthDate: "1960" }, now)).toBe(true);
  });
  it("born over 100 years ago means presumed deceased", () => {
    expect(inferLiving({ birthDate: "~1900" }, now)).toBe(false);
  });
  it("no information means unknown", () => {
    expect(inferLiving({ fullName: "Sutarno" }, now)).toBeNull();
  });
  it("manual override wins", () => {
    expect(inferLiving({ deathDate: "1999", isLiving: true, livingIsManual: true }, now)).toBe(true);
  });
  it("unknown is treated as living for privacy", () => {
    expect(treatAsLiving(null)).toBe(true);
    expect(treatAsLiving(false)).toBe(false);
  });
});

describe("redactPerson", () => {
  const living = {
    fullName: "Sari",
    isLiving: true as boolean | null,
    birthDate: "1990",
    birthYear: 1990,
    birthPlace: "Bandung",
    notes: "teacher",
  };

  it("hides details of living people from viewers when the setting is on", () => {
    const r = redactPerson(living, "VIEWER", true);
    expect(r).toMatchObject({ fullName: "Sari", birthDate: null, birthYear: null, birthPlace: null, notes: null, redacted: true });
  });
  it("hides unknown-status people too", () => {
    expect(redactPerson({ ...living, isLiving: null }, "VIEWER", true).redacted).toBe(true);
  });
  it("shows deceased people in full", () => {
    expect(redactPerson({ ...living, isLiving: false }, "VIEWER", true).birthDate).toBe("1990");
  });
  it("shows everything when the setting is off", () => {
    expect(redactPerson(living, "VIEWER", false).redacted).toBe(false);
  });
  it("never redacts for editors or owners", () => {
    expect(redactPerson(living, "EDITOR", true).birthPlace).toBe("Bandung");
    expect(redactPerson(living, "OWNER", true).birthPlace).toBe("Bandung");
  });
});
