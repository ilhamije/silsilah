import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchTrees, mergeConfig, type MergeTree, type MergePerson } from "@/lib/merge";
import { normalizeName, nameKeyOf } from "@/lib/merge/normalize";
import { jaroWinkler, bestNameSimilarity } from "@/lib/merge/similarity";

const person = (id: string, fullName: string, extra: Partial<MergePerson> = {}): MergePerson => ({
  id,
  fullName,
  nicknames: [],
  gender: "UNKNOWN",
  birthYear: null,
  ...extra,
});

const tree = (id: string, people: MergePerson[], parentChild: [string, string][] = []): MergeTree => ({
  id,
  people,
  parentChild,
  spouses: [],
});

describe("normalizeName", () => {
  it("strips honorifics, titles and diacritics", () => {
    expect(normalizeName("H. Muhammad Soerjo, S.H.").full).toBe("muhammad surjo");
    expect(normalizeName("Ibu Siti Aisyah").full).toBe("siti aisyah");
  });
  it("maps Muhammad variants to one form", () => {
    for (const v of ["Mohammad", "Mohamed", "Moh.", "M.", "Muhamad"]) {
      expect(normalizeName(`${v} Ali`).given).toBe("muhammad");
    }
  });
  it("splits patronymics", () => {
    const n = normalizeName("Ahmad bin Yusuf");
    expect(n.tokens).toEqual(["ahmad"]);
    expect(n.fatherTokens).toEqual(["yusuf"]);
  });
  it("keeps a lone honorific-looking name", () => {
    expect(normalizeName("Haji").full).toBe("haji");
  });
  it("gives a phonetic key that tolerates doubled letters", () => {
    expect(nameKeyOf("Siti Aminah")).toBe(nameKeyOf("Sitti Aminah"));
  });
});

describe("similarity", () => {
  it("scores identical and unrelated strings", () => {
    expect(jaroWinkler("budi", "budi")).toBe(1);
    expect(jaroWinkler("budi", "xyz")).toBeLessThan(0.5);
  });
  it("uses nicknames", () => {
    const a = { fullName: "Muhammad Hasan", nicknames: ["Acan"] };
    expect(bestNameSimilarity(a, { fullName: "Acan" })).toBeGreaterThanOrEqual(0.88);
  });
});

// Tree A and B both contain grandparent Hasan, parent Budi, children Siti and Joko.
const family = (suffix: string, opts: { names?: Record<string, string> } = {}) => {
  const n = (id: string, d: string) => opts.names?.[id] ?? d;
  return tree(
    suffix,
    [
      person(`g${suffix}`, n("g", "Hasan Basri"), { birthYear: 1920 }),
      person(`p${suffix}`, n("p", "Budi Santoso"), { birthYear: 1950 }),
      person(`s${suffix}`, n("s", "Siti Aminah"), { birthYear: 1978 }),
      person(`j${suffix}`, n("j", "Joko Widodo"), { birthYear: 1981 }),
    ],
    [
      [`g${suffix}`, `p${suffix}`],
      [`p${suffix}`, `s${suffix}`],
      [`p${suffix}`, `j${suffix}`],
    ],
  );
};

describe("matchTrees", () => {
  it("matches overlapping trees with a High or Medium score", () => {
    const r = matchTrees(family("A"), family("B"))!;
    expect(r).not.toBeNull();
    expect(r.pairs).toHaveLength(4);
    expect(r.band).not.toBe("LOW");
    expect(r.evidence).toHaveLength(4);
  });

  it("suggests nothing for a single matched pair", () => {
    const a = tree("A", [person("a1", "Budi Santoso"), person("a2", "Rina")]);
    const b = tree("B", [person("b1", "Budi Santoso"), person("b2", "Dewi Lestari")]);
    expect(matchTrees(a, b)).toBeNull();
  });

  it("suggests nothing for two matches with no relationship", () => {
    const a = tree("A", [person("a1", "Budi Santoso"), person("a2", "Siti Aminah")]);
    const b = tree("B", [person("b1", "Budi Santoso"), person("b2", "Siti Aminah")]);
    expect(matchTrees(a, b)).toBeNull();
  });

  it("suggests a matched parent and child (direct line)", () => {
    const a = tree("A", [person("a1", "Budi Santoso"), person("a2", "Siti Aminah")], [["a1", "a2"]]);
    const b = tree("B", [person("b1", "Budi Santoso"), person("b2", "Siti Aminah")], [["b1", "b2"]]);
    const r = matchTrees(a, b)!;
    expect(r.pairs).toHaveLength(2);
    expect(r.band).toBe("LOW");
  });

  it("is strict when directLinkMaxDepth is 0", () => {
    const a = tree("A", [person("a1", "Budi Santoso"), person("a2", "Siti Aminah")], [["a1", "a2"]]);
    const b = tree("B", [person("b1", "Budi Santoso"), person("b2", "Siti Aminah")], [["b1", "b2"]]);
    const cfg = { ...mergeConfig, directLinkMaxDepth: 0 };
    expect(matchTrees(a, b, cfg)).toBeNull();
  });

  it("does not pair a grandchild in one tree with a child in the other", () => {
    const a = tree(
      "A",
      [person("a1", "Hasan Basri"), person("a2", "Budi Santoso"), person("a3", "Siti Aminah")],
      [["a1", "a2"], ["a2", "a3"]],
    );
    // In B, Siti is Hasan's direct child instead of grandchild, and Budi is a sibling.
    const b = tree(
      "B",
      [person("b1", "Hasan Basri"), person("b2", "Budi Santoso"), person("b3", "Siti Aminah")],
      [["b1", "b2"], ["b1", "b3"]],
    );
    const r = matchTrees(a, b);
    // Hasan→Budi is a direct line in both; Siti is not confirmed through a mismatched distance.
    expect(r?.pairs.map((p) => p.aId).sort()).toEqual(["a1", "a2"]);
  });

  it("matches siblings through a matched parent", () => {
    const a = family("A");
    const b = family("B");
    // Remove the grandparent from both: the parent anchors the two siblings.
    const strip = (t: MergeTree) => ({ ...t, people: t.people.filter((p) => !p.id.startsWith("g")), parentChild: t.parentChild.filter(([x]) => !x.startsWith("g")) });
    expect(matchTrees(strip(a), strip(b))!.pairs).toHaveLength(3);
  });

  it("matches cousins through a matched grandparent", () => {
    const mk = (s: string) =>
      tree(
        s,
        [person(`g${s}`, "Hasan Basri"), person(`x${s}`, "Ali Imron"), person(`y${s}`, "Umar Said"), person(`c1${s}`, "Dedi Kurniawan"), person(`c2${s}`, "Eka Putri")],
        [[`g${s}`, `x${s}`], [`g${s}`, `y${s}`], [`x${s}`, `c1${s}`], [`y${s}`, `c2${s}`]],
      );
    const r = matchTrees(mk("A"), mk("B"))!;
    expect(r.pairs.length).toBe(5);
  });

  it("matches parents through a matched child (common descendant)", () => {
    const mk = (s: string) =>
      tree(s, [person(`m${s}`, "Fatimah Zahra"), person(`f${s}`, "Ibrahim Malik"), person(`k${s}`, "Rizki Pratama")], [
        [`m${s}`, `k${s}`],
        [`f${s}`, `k${s}`],
      ]);
    expect(matchTrees(mk("A"), mk("B"))!.pairs).toHaveLength(3);
  });

  it("drops pairs with a birth-year gap over 5", () => {
    const a = family("A");
    const b = family("B");
    b.people = b.people.map((p) => (p.id === "pB" ? { ...p, birthYear: 1970 } : p));
    const r = matchTrees(a, b)!;
    expect(r.pairs.find((p) => p.aId === "pA")).toBeUndefined();
  });

  it("drops pairs with different known genders", () => {
    const a = tree("A", [person("a1", "Budi Santoso", { gender: "MALE" }), person("a2", "Siti Aminah")], [["a1", "a2"]]);
    const b = tree("B", [person("b1", "Budi Santoso", { gender: "FEMALE" }), person("b2", "Siti Aminah")], [["b1", "b2"]]);
    expect(matchTrees(a, b)).toBeNull();
  });

  it("ignores a decoy that shares names but not structure", () => {
    const decoy = tree("C", [person("c1", "Hasan Basri"), person("c2", "Budi Santoso"), person("c3", "Siti Aminah")]);
    expect(matchTrees(family("A"), decoy)).toBeNull();
  });

  it("matches one person to at most one person", () => {
    const a = tree("A", [person("a1", "Budi Santoso"), person("a2", "Siti Aminah")], [["a1", "a2"]]);
    const b = tree("B", [person("b1", "Budi Santoso"), person("b1x", "Budi Santoso"), person("b2", "Siti Aminah")], [["b1", "b2"], ["b1x", "b2"]]);
    const r = matchTrees(a, b)!;
    expect(new Set(r.pairs.map((p) => p.bId)).size).toBe(r.pairs.length);
  });

  it("gives the same fingerprint for the same pairs and a different one otherwise", () => {
    const r1 = matchTrees(family("A"), family("B"))!;
    const r2 = matchTrees(family("A"), family("B"))!;
    expect(r1.fingerprint).toBe(r2.fingerprint);
    const strip = (t: MergeTree) => ({ ...t, people: t.people.slice(0, 3), parentChild: t.parentChild.slice(0, 2) });
    expect(matchTrees(strip(family("A")), strip(family("B")))!.fingerprint).not.toBe(r1.fingerprint);
  });
});

describe("fixtures", () => {
  const load = (n: string) =>
    JSON.parse(readFileSync(`fixtures/trees/${n}.json`, "utf8")) as MergeTree;
  it("matches the overlapping trees and ignores the decoy", () => {
    const r = matchTrees(load("overlap-a"), load("overlap-b"))!;
    expect(r.pairs.map((p) => `${p.aId}:${p.bId}`).sort()).toEqual(["a1:b1", "a2:b2", "a3:b5", "a7:b3", "a8:b4"]);
    expect(matchTrees(load("overlap-a"), load("decoy-c"))).toBeNull();
  });
});
