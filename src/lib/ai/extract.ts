import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Locale } from "@/i18n/config";
import { buildUserContent, EXTRACTION_SYSTEM_PROMPT, type KnownPerson } from "./prompt";
import { extractionSchema, normalizeExtraction, type Extraction } from "./schema";

export const DEFAULT_MODEL = "claude-sonnet-5";

/** The slice of the SDK client we use; tests pass a fake. */
export type ExtractionClient = { messages: Pick<Anthropic["messages"], "parse"> };

export type ExtractionErrorCode =
  | "not_configured" // missing or invalid API key
  | "rate_limited" // 429
  | "unavailable" // 5xx / 529 overloaded
  | "timeout"
  | "network"
  | "refused" // model declined the request
  | "invalid_output" // still unusable after one retry
  | "image_rejected_by_api" // 400, e.g. unreadable image data
  | "unknown";

const RETRYABLE: ExtractionErrorCode[] = ["rate_limited", "unavailable", "timeout", "network"];

export class ExtractionError extends Error {
  readonly retryable: boolean;
  constructor(
    public code: ExtractionErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ExtractionError";
    this.retryable = RETRYABLE.includes(code);
  }
}

// Most specific first. APIConnectionTimeoutError extends APIConnectionError,
// which extends APIError in the TypeScript SDK.
function classifyApiError(err: unknown): ExtractionError {
  if (err instanceof ExtractionError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ExtractionError("not_configured", err.message);
  }
  if (err instanceof Anthropic.RateLimitError) return new ExtractionError("rate_limited", err.message);
  if (err instanceof Anthropic.BadRequestError) return new ExtractionError("image_rejected_by_api", err.message);
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ExtractionError("timeout", err.message);
  if (err instanceof Anthropic.APIConnectionError) return new ExtractionError("network", err.message);
  if (err instanceof Anthropic.InternalServerError) return new ExtractionError("unavailable", err.message);
  if (err instanceof Anthropic.APIError) {
    return new ExtractionError(err.status && err.status >= 500 ? "unavailable" : "unknown", err.message);
  }
  return new ExtractionError("unknown", err instanceof Error ? err.message : String(err));
}

/** Output that didn't match the schema (bad JSON or failed validation), not an HTTP error. */
const isInvalidOutput = (err: unknown) =>
  err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError);

let sharedClient: Anthropic | undefined;

/**
 * One SDK retry for transient errors, with a timeout that keeps the worst case
 * (2 attempts, plus our one retry for invalid output) inside Vercel Hobby's
 * 300-second function limit in practice.
 */
export function getExtractionClient(): ExtractionClient {
  if (!process.env.ANTHROPIC_API_KEY) throw new ExtractionError("not_configured");
  sharedClient ??= new Anthropic({ maxRetries: 1, timeout: 120_000 });
  return sharedClient;
}

export type ExtractPageInput = {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  pageNumber: number;
  totalPages: number;
  knownPeople: KnownPerson[];
  locale: Locale;
};

export type ExtractPageResult = {
  extraction: Extraction;
  model: string;
  attempts: number;
  usage: { inputTokens: number; outputTokens: number };
};

/**
 * Sends one page to Claude and returns a validated, normalized extraction.
 * Invalid output is retried once; API errors are mapped to ExtractionError.
 */
export async function extractPage(
  client: ExtractionClient,
  input: ExtractPageInput,
  model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
): Promise<ExtractPageResult> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const content = buildUserContent(input);
  let lastProblem = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.messages.parse({
        model,
        max_tokens: 16000,
        system: [{ type: "text", text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content:
              attempt === 1
                ? content
                : [...content, { type: "text", text: `Your previous answer could not be used (${lastProblem}). Answer again with JSON that matches the required format exactly.` }],
          },
        ],
        output_config: { format: zodOutputFormat(extractionSchema) },
      });
      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;

      if (response.stop_reason === "refusal") throw new ExtractionError("refused");
      if (response.stop_reason === "max_tokens") {
        lastProblem = "the answer was cut off; keep notes short";
        continue;
      }
      // Validate again on our side: the contract must hold even if the API or SDK changes.
      const checked = extractionSchema.safeParse(response.parsed_output);
      if (!checked.success) {
        lastProblem = "it did not match the schema";
        continue;
      }
      return {
        extraction: normalizeExtraction(checked.data, input.locale),
        model: response.model,
        attempts: attempt,
        usage,
      };
    } catch (err) {
      if (isInvalidOutput(err)) {
        lastProblem = "it was not valid JSON for the schema";
        continue;
      }
      throw classifyApiError(err);
    }
  }
  throw new ExtractionError("invalid_output", lastProblem);
}
