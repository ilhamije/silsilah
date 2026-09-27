import { describe, expect, it } from "vitest";
import { passwordLoginSecret, passwordMatches, sessionCookieName } from "@/lib/password-login";

describe("password login", () => {
  it("is off unless PASSWORD_LOGIN_SECRET is set", () => {
    expect(passwordLoginSecret({})).toBeNull();
    expect(passwordLoginSecret({ PASSWORD_LOGIN_SECRET: "" })).toBeNull();
    expect(passwordLoginSecret({ PASSWORD_LOGIN_SECRET: "s3cret" })).toBe("s3cret");
  });

  it("accepts only the exact password", () => {
    expect(passwordMatches("s3cret", "s3cret")).toBe(true);
    expect(passwordMatches("s3cret ", "s3cret")).toBe(false);
    expect(passwordMatches("S3cret", "s3cret")).toBe(false);
    expect(passwordMatches("", "s3cret")).toBe(false);
  });

  it("uses the Auth.js session cookie name", () => {
    expect(sessionCookieName(false)).toBe("authjs.session-token");
    expect(sessionCookieName(true)).toBe("__Secure-authjs.session-token");
  });
});
