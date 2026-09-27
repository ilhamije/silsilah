import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionClient } from "@/lib/ai/extract";
import validFixture from "../../fixtures/extraction-valid.json";

export { validFixture };

type Step =
  | { kind: "ok"; output: unknown; stop_reason?: string }
  | { kind: "invalid" } // SDK failed to parse the structured output
  | { kind: "throw"; error: unknown };

/** A stand-in for client.messages.parse that plays back scripted responses. */
export function fakeClient(steps: Step[]) {
  const calls: unknown[] = [];
  const client: ExtractionClient = {
    messages: {
      parse: (async (params: unknown) => {
        calls.push(params);
        const step = steps.shift();
        if (!step) throw new Error("fakeClient: no more scripted responses");
        if (step.kind === "throw") throw step.error;
        if (step.kind === "invalid") throw new Anthropic.AnthropicError("Failed to parse structured output");
        return {
          model: "claude-sonnet-5",
          stop_reason: step.stop_reason ?? "end_turn",
          usage: { input_tokens: 1500, output_tokens: 800 },
          parsed_output: step.output,
          content: [],
        };
      }) as unknown as ExtractionClient["messages"]["parse"],
    },
  };
  return { client, calls };
}

export const apiError = (status: number) =>
  Anthropic.APIError.generate(status, { error: { type: "x", message: "x" } }, "x", new Headers());
