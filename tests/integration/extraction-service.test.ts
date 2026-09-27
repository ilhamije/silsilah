import { beforeEach, expect, it } from "vitest";
import { describeDb, makeUser, resetDb, testDb } from "../helpers/db";
import { apiError, fakeClient, validFixture } from "../helpers/fake-ai";
import { HttpError } from "@/lib/errors";
import { createTree } from "@/lib/trees";
import { runPageExtraction, type ExtractRequest } from "@/lib/extraction/service";
import rejected from "../../fixtures/extraction-rejected.json";

const db = testDb();

const request: ExtractRequest = {
  image: { base64: "AAAA", mediaType: "image/jpeg" },
  pageIndex: 0,
  totalPages: 1,
  knownPeople: [],
  locale: "en",
};

async function setup() {
  const owner = await makeUser("owner");
  const viewer = await makeUser("viewer");
  const tree = await createTree(db, owner.id, "Keluarga Hasan");
  await db.treeMember.create({ data: { treeId: tree.id, userId: viewer.id, role: "VIEWER" } });
  return { owner, viewer, tree };
}

describeDb("runPageExtraction", () => {
  beforeEach(resetDb);

  it("viewers can't send photos to the AI", async () => {
    const { viewer, tree } = await setup();
    const { client, calls } = fakeClient([{ kind: "ok", output: validFixture }]);
    const err = await runPageExtraction(db, viewer.id, tree.id, request, { client }).catch((e: unknown) => e);
    expect((err as HttpError).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("returns page-scoped people and logs counts only, never names", async () => {
    const { owner, tree } = await setup();
    const { client } = fakeClient([{ kind: "ok", output: validFixture }]);
    const res = await runPageExtraction(db, owner.id, tree.id, request, { client });
    expect(res.verdict).toEqual({ kind: "ok" });
    expect(res.extraction.people[0].temp_id).toBe("pg1.p1");

    const log = await db.extractionLog.findFirstOrThrow();
    expect(log).toMatchObject({ outcome: "OK", peopleCount: 8, inputTokens: 1500, outputTokens: 800, language: "id" });
    expect(JSON.stringify(log)).not.toContain("Hasan");
  });

  it("logs rejected images with the reason, for prompt tuning", async () => {
    const { owner, tree } = await setup();
    const { client } = fakeClient([{ kind: "ok", output: rejected }]);
    const res = await runPageExtraction(db, owner.id, tree.id, request, { client });
    expect(res.verdict.kind).toBe("rejected");
    expect(await db.extractionLog.findFirstOrThrow()).toMatchObject({
      outcome: "REJECTED",
      reason: "This looks like a shop receipt, not a family tree.",
    });
  });

  it("turns AI failures into clear, retryable HTTP errors and logs them", async () => {
    const { owner, tree } = await setup();
    const { client } = fakeClient([{ kind: "throw", error: apiError(429) }]);
    const err = (await runPageExtraction(db, owner.id, tree.id, request, { client }).catch((e: unknown) => e)) as HttpError;
    expect(err.status).toBe(429);
    expect(err.code).toBe("ai_busy");
    expect(err.details).toEqual({ retryable: true });
    expect(await db.extractionLog.findFirstOrThrow()).toMatchObject({ outcome: "FAILED", reason: "rate_limited" });
  });

  it("enforces the per-user daily limit", async () => {
    const { owner, tree } = await setup();
    const { client } = fakeClient([
      { kind: "ok", output: validFixture },
      { kind: "ok", output: validFixture },
    ]);
    await runPageExtraction(db, owner.id, tree.id, request, { client, dailyLimit: 1 });
    const err = (await runPageExtraction(db, owner.id, tree.id, request, { client, dailyLimit: 1 }).catch(
      (e: unknown) => e,
    )) as HttpError;
    expect(err.status).toBe(429);
    expect(err.code).toBe("daily_limit");
    // A day later the limit has reset.
    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);
    await expect(
      runPageExtraction(db, owner.id, tree.id, request, { client, dailyLimit: 1, now: tomorrow }),
    ).resolves.toBeTruthy();
  });
});
