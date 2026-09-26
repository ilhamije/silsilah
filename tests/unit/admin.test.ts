import { describe, expect, it } from "vitest";
import { isAdminEmail, parseAdminEmails } from "@/lib/authz/admin";

describe("ADMIN_EMAILS", () => {
  const admins = parseAdminEmails(" Alice@Example.com, bob@example.com ,, not-an-email ");

  it("parses a comma-separated list, trimming and lowercasing", () => {
    expect([...admins].sort()).toEqual(["alice@example.com", "bob@example.com"]);
  });
  it("matches case-insensitively", () => {
    expect(isAdminEmail("ALICE@example.com", admins)).toBe(true);
  });
  it("rejects anyone else", () => {
    expect(isAdminEmail("carol@example.com", admins)).toBe(false);
    expect(isAdminEmail(null, admins)).toBe(false);
  });
  it("means no admins when unset", () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(parseAdminEmails("").size).toBe(0);
  });
});
