import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { extractionSchema, normalizeExtraction, type Extraction } from "@/lib/ai/schema";
import { classifyExtraction } from "@/lib/ai/classify";
import { extractPage, ExtractionError } from "@/lib/ai/extract";
import { combinePages, knownPeopleFrom, scopePageIds } from "@/lib/ai/combine";
import { sniffImageType } from "@/lib/extraction/image-check";
import valid from "../../fixtures/extraction-valid.json";
import page2 from "../../fixtures/extraction-page2.json";
import rejected from "../../fixtures/extraction-rejected.json";
import borderline from "../../fixtures/extraction-borderline.json";
import { apiError, fakeClient } from "../helpers/fake-ai";

const input = {
  imageBase64: "AAAA",
  mediaType: "image/jpeg" as const,
  pageNumber: 1,
  totalPages: 1,
  knownPeople: [],
  locale: "en" as const,
};

describe("fixtures", () => {
  it.each([
    ["valid", valid],
    ["page2", page2],
    ["rejected", rejected],
    ["borderline", borderline],
  ])("%s matches the extraction schema", (_name, fixture) => {
    expect(extractionSchema.safeParse(fixture).success).toBe(true);
  });
});

describe("normalizeExtraction", () => {
  const base = extractionSchema.parse(valid);

  it("clamps confidences into 0..1", () => {
    const e = normalizeExtraction({ ...base, confidence: 1.4 });
    expect(e.confidence).toBe(1);
  });

  it("drops links to people who aren't on the page and says so", () => {
    const e = normalizeExtraction(
      {
        ...base,
        unclear_items: [],
        relationships: [...base.relationships, { type: "parent_child", from_temp_id: "p1", to_temp_id: "ghost", confidence: 0.9 }],
      },
      "id",
    );
    expect(e.relationships).toHaveLength(base.relationships.length);
    expect(e.unclear_items[0]).toMatch(/periksa hubungannya/);
  });

  it("discards malformed boxes and trims blank fields", () => {
    const p = { ...base.people[0], bbox: [0.1, 0.2], birth_place: "  " };
    const e = normalizeExtraction({ ...base, people: [p] as Extraction["people"], relationships: [] });
    expect(e.people[0].bbox).toBeNull();
    expect(e.people[0].birth_place).toBeNull();
  });
});

describe("classifyExtraction", () => {
  it("accepts a clear family tree", () => {
    expect(classifyExtraction(extractionSchema.parse(valid))).toEqual({ kind: "ok" });
  });
  it("rejects a non-family-tree image with the model's reason", () => {
    expect(classifyExtraction(extractionSchema.parse(rejected))).toEqual({
      kind: "rejected",
      reason: "This looks like a shop receipt, not a family tree.",
    });
  });
  it("flags a name list with no relationships as borderline, not rejected", () => {
    const v = classifyExtraction(extractionSchema.parse(borderline));
    expect(v.kind).toBe("borderline");
    expect(v.kind === "borderline" && v.reasons).toEqual(["no_relationships", "low_confidence"]);
  });
});

describe("extractPage", () => {
  it("returns a normalized extraction on success", async () => {
    const { client, calls } = fakeClient([{ kind: "ok", output: valid }]);
    const r = await extractPage(client, input, "claude-sonnet-5");
    expect(r.attempts).toBe(1);
    expect(r.extraction.people).toHaveLength(8);
    expect(r.usage).toEqual({ inputTokens: 1500, outputTokens: 800 });
    expect(calls[0]).toMatchObject({ model: "claude-sonnet-5", output_config: { format: { type: "json_schema" } } });
  });

  it("retries once when the output can't be parsed, then succeeds", async () => {
    const { client, calls } = fakeClient([{ kind: "invalid" }, { kind: "ok", output: valid }]);
    const r = await extractPage(client, input);
    expect(r.attempts).toBe(2);
    expect(JSON.stringify(calls[1])).toContain("previous answer could not be used");
  });

  it("retries once when our own validation fails", async () => {
    const { client } = fakeClient([{ kind: "ok", output: { nope: true } }, { kind: "ok", output: valid }]);
    expect((await extractPage(client, input)).attempts).toBe(2);
  });

  it("gives up after the one retry", async () => {
    const { client } = fakeClient([{ kind: "invalid" }, { kind: "invalid" }]);
    await expect(extractPage(client, input)).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("retries when the answer was cut off", async () => {
    const { client } = fakeClient([
      { kind: "ok", output: null, stop_reason: "max_tokens" },
      { kind: "ok", output: valid },
    ]);
    expect((await extractPage(client, input)).attempts).toBe(2);
  });

  it("reports a refusal without retrying", async () => {
    const { client, calls } = fakeClient([{ kind: "ok", output: null, stop_reason: "refusal" }]);
    await expect(extractPage(client, input)).rejects.toMatchObject({ code: "refused" });
    expect(calls).toHaveLength(1);
  });

  it.each([
    [429, "rate_limited", true],
    [529, "unavailable", true],
    [500, "unavailable", true],
    [401, "not_configured", false],
    [400, "image_rejected_by_api", false],
  ])("maps HTTP %i to %s (retryable: %s)", async (status, code, retryable) => {
    const { client } = fakeClient([{ kind: "throw", error: apiError(status) }]);
    const err = await extractPage(client, input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect(err).toMatchObject({ code, retryable });
  });

  it("maps timeouts and network failures", async () => {
    const timeout = fakeClient([{ kind: "throw", error: new Anthropic.APIConnectionTimeoutError() }]);
    await expect(extractPage(timeout.client, input)).rejects.toMatchObject({ code: "timeout", retryable: true });
    const network = fakeClient([{ kind: "throw", error: new Anthropic.APIConnectionError({ message: "x" }) }]);
    await expect(extractPage(network.client, input)).rejects.toMatchObject({ code: "network" });
  });
});

describe("multi-page combining", () => {
  const p1 = scopePageIds(extractionSchema.parse(valid), "pg1", new Set());
  const known = knownPeopleFrom(p1.people.map((p) => ({ ...p, pages: [0] })));
  // Page 2 reuses Rahmat's id; the model sees page-1 ids as KNOWN_PEOPLE.
  const page2Raw = extractionSchema.parse(page2);
  const rahmatId = p1.people.find((p) => p.full_name === "Rahmat")!.temp_id;
  const p2 = scopePageIds(
    {
      ...page2Raw,
      people: page2Raw.people.map((p) => (p.temp_id === "p5" ? { ...p, temp_id: rahmatId } : p)),
      relationships: page2Raw.relationships.map((r) => ({
        ...r,
        from_temp_id: r.from_temp_id === "p5" ? rahmatId : r.from_temp_id,
        to_temp_id: r.to_temp_id === "p5" ? rahmatId : r.to_temp_id,
      })),
    },
    "pg2",
    new Set(known.map((k) => k.temp_id)),
  );

  it("scopes new ids per page so page 2's p1 doesn't collide with page 1's p1", () => {
    expect(p1.people[0].temp_id).toBe("pg1.p1");
    expect(p2.people.map((p) => p.temp_id)).toEqual([rahmatId, "pg2.p1", "pg2.p2", "pg2.p3"]);
  });

  it("merges a person seen on two pages and fills gaps from the later page", () => {
    const combined = combinePages([
      { pageIndex: 1, extraction: p2 },
      { pageIndex: 0, extraction: p1 },
    ]);
    const rahmat = combined.people.find((p) => p.temp_id === rahmatId)!;
    expect(rahmat.pages).toEqual([0, 1]);
    expect(rahmat.birth_place).toBe("Garut"); // only on page 2
    expect(rahmat.death_date).toBe("2001"); // only on page 1
    expect(rahmat.nicknames).toEqual(["Mamat"]);
    expect(combined.people).toHaveLength(8 + 3);
    expect(combined.relationships).toHaveLength(p1.relationships.length + p2.relationships.length);
    expect(combined.unclearItems.every((u) => u.page === 0)).toBe(true);
  });

  it("flags same-name people for a 'same person?' check instead of merging them", () => {
    const combined = combinePages([
      { pageIndex: 0, extraction: p1 },
      { pageIndex: 1, extraction: p2 },
    ]);
    expect(combined.possibleDuplicates).toEqual([["pg1.p4", "pg2.p3"]]); // two different "Sari"s
  });
});

describe("sniffImageType", () => {
  it.each([
    [[0xff, 0xd8, 0xff, 0xe0], "image/jpeg"],
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"],
    [[...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")], "image/webp"],
    [[...Buffer.from("%PDF-1.4")], null],
    [[...Buffer.from("<svg")], null],
  ])("%j → %s", (bytes, expected) => {
    expect(sniffImageType(new Uint8Array(bytes as number[]))).toBe(expected);
  });
});
