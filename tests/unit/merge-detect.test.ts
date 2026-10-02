import { describe, expect, it } from "vitest";
import { normalizeName } from "@/lib/merge/normalize";
import { jaroWinkler, nameSimilarity } from "@/lib/merge/similarity";
import { detectMerge, shouldResuggest, type MatchTree } from "@/lib/merge/detect";
import { DEFAULT_MERGE_CONFIG } from "@/lib/merge/config";

const p = (id: string, fullName: string, extra: object = {}) => ({ id, fullName, ...extra });
const tree = (people: ReturnType<typeof p>[], parentChild: [string, string][] = [], spouses: [string, string][] = []): MatchTree => ({
  people, parentChild, spouses,
});

describe("normalizeName", () => {
  it("strips titles, diacritics and maps old spellings", () => {
    expect(normalizeName("H. Moehammad Soeharto, S.H.").full).toBe("muhammad suharto");
    expect(normalizeName("Djoko Tjahjono").full).toBe("joko cahjono");
  });
  it("splits patronymics", () => {
    const n = normalizeName("Ahmad bin Abdullah");
    expect(n.full).toBe("ahmad");
    expect(n.father).toBe("abdullah");
  });
});

describe("nameSimilarity", () => {
  const cfg = DEFAULT_MERGE_CONFIG;
  it("matches spelling variants", () => {
    expect(nameSimilarity(p("1", "Mohammad Rizal"), p("2", "Muhammad Rizal"), cfg)).toBeGreaterThan(0.9);
  });
  it("matches via nicknames", () => {
    expect(nameSimilarity(p("1", "Siti Aminah", { nicknames: ["Mimi"] }), p("2", "Mimi"), cfg)).toBeGreaterThan(0.9);
  });
  it("rejects hard conflicts", () => {
    expect(nameSimilarity(p("1", "Rizal", { birthYear: 1950 }), p("2", "Rizal", { birthYear: 1960 }), cfg)).toBe(0);
    expect(nameSimilarity(p("1", "Rizal", { gender: "MALE" }), p("2", "Rizal", { gender: "FEMALE" }), cfg)).toBe(0);
  });
  it("has sane Jaro-Winkler values", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 2);
  });
});

describe("detectMerge", () => {
  const A = tree(
    [p("a1", "Budi Santoso"), p("a2", "Ani Wijaya"), p("a3", "Candra Santoso")],
    [["a1", "a2"], ["a1", "a3"]],
  );
  const B = tree(
    [p("b1", "Budi Santoso"), p("b2", "Ani Wijaya"), p("b3", "Candra Santoso")],
    [["b1", "b2"], ["b1", "b3"]],
  );

  it("suggests when siblings and their parent match", () => {
    const d = detectMerge(A, B)!;
    expect(d.confirmed).toHaveLength(3);
    expect(d.score).toBeGreaterThan(2.5);
  });
  it("does not suggest for a single matched pair", () => {
    expect(detectMerge(tree([p("a1", "Budi Santoso")]), tree([p("b1", "Budi Santoso")]))).toBeNull();
  });
  it("does not suggest two unrelated matched pairs", () => {
    const x = tree([p("a1", "Budi Santoso"), p("a2", "Ani Wijaya")]);
    const y = tree([p("b1", "Budi Santoso"), p("b2", "Ani Wijaya")]);
    expect(detectMerge(x, y)).toBeNull();
  });
  it("suggests a matched parent and child (direct line)", () => {
    const x = tree([p("a1", "Budi Santoso"), p("a2", "Ani Wijaya")], [["a1", "a2"]]);
    const y = tree([p("b1", "Budi Santoso"), p("b2", "Ani Wijaya")], [["b1", "b2"]]);
    expect(detectMerge(x, y)?.confirmed).toHaveLength(2);
    expect(detectMerge(x, y, { directLinkMaxDepth: 0 })).toBeNull();
  });
  it("requires identical generation distances", () => {
    const x = tree([p("a1", "Budi Santoso"), p("a2", "Ani Wijaya")], [["a1", "a2"]]);
    const y = tree(
      [p("b1", "Budi Santoso"), p("bm", "Middle Person"), p("b2", "Ani Wijaya")],
      [["b1", "bm"], ["bm", "b2"]],
    );
    expect(detectMerge(x, y)).toBeNull();
  });
  it("suggests cousins via a matched grandparent", () => {
    const mk = (s: string) =>
      tree(
        [p(`${s}g`, "Hasan Basri"), p(`${s}p1`, "Umar Basri"), p(`${s}p2`, "Salim Basri"), p(`${s}c1`, "Dina Umar"), p(`${s}c2`, "Eko Salim")],
        [[`${s}g`, `${s}p1`], [`${s}g`, `${s}p2`], [`${s}p1`, `${s}c1`], [`${s}p2`, `${s}c2`]],
      );
    const d = detectMerge(mk("a"), mk("b"), { directLinkMaxDepth: 0 })!;
    expect(d.confirmed.map((c) => c.aId)).toContain("ag");
  });
  it("drops pairs with a birth-year gap over 5", () => {
    const x = tree([p("a1", "Budi Santoso", { birthYear: 1950 }), p("a2", "Ani Wijaya")], [["a1", "a2"]]);
    const y = tree([p("b1", "Budi Santoso", { birthYear: 1970 }), p("b2", "Ani Wijaya")], [["b1", "b2"]]);
    expect(detectMerge(x, y)).toBeNull();
  });
  it("keeps matches one-to-one", () => {
    const x = tree([p("a1", "Budi Santoso"), p("a2", "Budi Santoso")]);
    const y = tree([p("b1", "Budi Santoso")]);
    expect(detectMerge(x, y)).toBeNull();
  });
});

describe("shouldResuggest", () => {
  it("needs enough new pairs or a higher band", () => {
    const d = detectMerge(
      tree([p("a1", "Budi Santoso"), p("a2", "Ani Wijaya"), p("a3", "Candra Santoso")], [["a1", "a2"], ["a1", "a3"]]),
      tree([p("b1", "Budi Santoso"), p("b2", "Ani Wijaya"), p("b3", "Candra Santoso")], [["b1", "b2"], ["b1", "b3"]]),
    )!;
    const same = { pairs: d.confirmed, band: d.band };
    expect(shouldResuggest(same, d)).toBe(false);
    expect(shouldResuggest({ pairs: d.confirmed.slice(0, 1), band: d.band }, d)).toBe(true);
    expect(shouldResuggest({ pairs: d.confirmed, band: "LOW" }, { ...d, band: "HIGH" })).toBe(true);
  });
});
