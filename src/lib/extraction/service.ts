import type { Db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/config";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { HttpError } from "@/lib/errors";
import {
  extractPage,
  ExtractionError,
  getExtractionClient,
  type ExtractionClient,
  type ExtractionErrorCode,
} from "@/lib/ai/extract";
import { classifyExtraction, type PageVerdict } from "@/lib/ai/classify";
import { scopePageIds } from "@/lib/ai/combine";
import type { KnownPerson } from "@/lib/ai/prompt";
import { extractionSchema, normalizeExtraction, type Extraction } from "@/lib/ai/schema";
import validFixture from "../../../fixtures/extraction-valid.json";
import page2Fixture from "../../../fixtures/extraction-page2.json";

/** Per user, per rolling 24 hours. Protects the API budget from runaway use. */
export const DEFAULT_DAILY_LIMIT = 60;

export type PageImage = { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };

export type ExtractRequest = {
  image: PageImage;
  pageIndex: number; // 0-based position, used in the prompt ("page 2 of 3")
  /** Stable per-photo key used to make this page's person ids unique. */
  pageScope?: string;
  totalPages: number;
  knownPeople: KnownPerson[];
  locale: Locale;
};

export type ExtractResponse = {
  pageIndex: number;
  extraction: Extraction;
  verdict: PageVerdict;
  model: string;
};

const httpForError: Record<ExtractionErrorCode, [number, string]> = {
  not_configured: [503, "ai_not_configured"],
  rate_limited: [429, "ai_busy"],
  unavailable: [503, "ai_unavailable"],
  timeout: [504, "ai_timeout"],
  network: [502, "ai_unavailable"],
  refused: [422, "ai_refused"],
  invalid_output: [422, "ai_invalid_output"],
  image_rejected_by_api: [422, "image_unreadable"],
  unknown: [500, "ai_unknown"],
};

/** Local development without an API key: return the sample fixtures instead. */
function mockEnabled() {
  return process.env.EXTRACTION_MOCK === "1" && process.env.VERCEL_ENV !== "production";
}

/**
 * Imitates the model's use of KNOWN_PEOPLE: a fixture person whose name and
 * birth date match someone from an earlier page gets that person's id.
 */
async function mockExtract(pageIndex: number, knownPeople: KnownPerson[], locale: Locale) {
  await new Promise((r) => setTimeout(r, 1200));
  const fixture = extractionSchema.parse(pageIndex === 0 ? validFixture : page2Fixture);
  const reuse = new Map<string, string>();
  for (const p of fixture.people) {
    const match = knownPeople.find(
      (k) => k.full_name === p.full_name && (!k.birth_date || !p.birth_date || k.birth_date === p.birth_date),
    );
    if (match) reuse.set(p.temp_id, match.temp_id);
  }
  const id = (x: string) => reuse.get(x) ?? x;
  const withKnownIds = {
    ...fixture,
    people: fixture.people.map((p) => ({ ...p, temp_id: id(p.temp_id) })),
    relationships: fixture.relationships.map((r) => ({ ...r, from_temp_id: id(r.from_temp_id), to_temp_id: id(r.to_temp_id) })),
  };
  return {
    extraction: normalizeExtraction(withKnownIds, locale),
    model: "mock",
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

/**
 * Reads one page. The image only lives in memory for this call: it is passed
 * to the AI and never written anywhere. Every attempt is logged (outcome and
 * counts only, no names or image data).
 */
export async function runPageExtraction(
  db: Db,
  userId: string,
  treeId: string,
  req: ExtractRequest,
  deps: { client?: ExtractionClient; dailyLimit?: number; now?: Date } = {},
): Promise<ExtractResponse> {
  await assertTreePermission(db, userId, treeId, "image.upload");

  const now = deps.now ?? new Date();
  const limit = deps.dailyLimit ?? (Number(process.env.EXTRACTION_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT);
  const recent = await db.extractionLog.count({
    where: { userId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
  });
  if (recent >= limit) throw new HttpError(429, "daily_limit", "daily_limit", { limit, retryable: false });

  const started = Date.now();
  const log = (data: Omit<Prisma.ExtractionLogUncheckedCreateInput, "userId" | "treeId">) =>
    db.extractionLog.create({ data: { userId, treeId, durationMs: Date.now() - started, ...data } });

  let result;
  try {
    result =
      !deps.client && mockEnabled()
        ? await mockExtract(req.pageIndex, req.knownPeople, req.locale)
        : await extractPage(deps.client ?? getExtractionClient(), {
            imageBase64: req.image.base64,
            mediaType: req.image.mediaType,
            pageNumber: req.pageIndex + 1,
            totalPages: req.totalPages,
            knownPeople: req.knownPeople,
            locale: req.locale,
          });
  } catch (err) {
    const e = err instanceof ExtractionError ? err : new ExtractionError("unknown", String(err));
    await log({ outcome: "FAILED", reason: e.code });
    if (e.code !== "rate_limited" && e.code !== "timeout") console.error("[extract]", e.code, e.message);
    const [status, code] = httpForError[e.code];
    throw new HttpError(status, code, code, { retryable: e.retryable });
  }

  const knownIds = new Set(req.knownPeople.map((p) => p.temp_id));
  const extraction = scopePageIds(result.extraction, req.pageScope ?? `pg${req.pageIndex + 1}`, knownIds);
  const verdict = classifyExtraction(extraction);
  await log({
    outcome: verdict.kind === "ok" ? "OK" : verdict.kind === "rejected" ? "REJECTED" : "BORDERLINE",
    reason: verdict.kind === "rejected" ? verdict.reason : verdict.kind === "borderline" ? verdict.reasons.join(",") : null,
    confidence: extraction.confidence,
    language: extraction.language_detected,
    peopleCount: extraction.people.length,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });
  return { pageIndex: req.pageIndex, extraction, verdict, model: result.model };
}
