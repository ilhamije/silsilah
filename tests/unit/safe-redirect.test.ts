import { expect, it } from "vitest";
import { safeRedirect } from "@/lib/safe-redirect";

it.each([
  ["/trees/abc", "/trees/abc"],
  ["/invite/tok", "/invite/tok"],
  ["https://evil.com", "/trees"],
  ["//evil.com", "/trees"],
  ["/\\evil.com", "/trees"],
  [undefined, "/trees"],
])("safeRedirect(%s) → %s", (input, expected) => {
  expect(safeRedirect(input)).toBe(expected);
});
