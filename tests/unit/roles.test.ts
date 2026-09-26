import { describe, expect, it } from "vitest";
import { can, hasRole } from "@/lib/authz/roles";

describe("roles", () => {
  it("orders roles owner > editor > viewer", () => {
    expect(hasRole("OWNER", "EDITOR")).toBe(true);
    expect(hasRole("EDITOR", "OWNER")).toBe(false);
    expect(hasRole("VIEWER", "VIEWER")).toBe(true);
  });

  it.each([
    ["VIEWER", "tree.read", true],
    ["VIEWER", "edit.suggest", true],
    ["VIEWER", "person.write", false],
    ["VIEWER", "image.upload", false],
    ["VIEWER", "merge.decide", false],
    ["EDITOR", "person.write", true],
    ["EDITOR", "merge.decide", true],
    ["EDITOR", "edit.review", true],
    ["EDITOR", "member.manage", false],
    ["EDITOR", "tree.delete", false],
    ["OWNER", "tree.delete", true],
    ["OWNER", "invite.manage", true],
  ] as const)("%s can %s: %s", (role, perm, expected) => {
    expect(can(role, perm)).toBe(expected);
  });

  it("no membership means no access", () => {
    expect(can(null, "tree.read")).toBe(false);
  });
});
