import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const { sendEmail, idempotencyKeyFor, EmailSendError } = await import("@/lib/email/send");

const email = {
  to: "delivered@resend.dev",
  subject: "Sign in to Silsilah",
  html: "<p>hi</p>",
  text: "hi",
  idempotencyKey: "magic-link/abc",
};

describe("sendEmail (Resend SDK)", () => {
  beforeEach(() => {
    send.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends with the verified sender, an array recipient and the idempotency key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Silsilah <noreply@silsilah.example>");
    send.mockResolvedValue({ data: { id: "49a3999c" }, error: null });
    await sendEmail(email);
    expect(send).toHaveBeenCalledWith(
      {
        from: "Silsilah <noreply@silsilah.example>",
        to: ["delivered@resend.dev"],
        subject: "Sign in to Silsilah",
        html: "<p>hi</p>",
        text: "hi",
      },
      { idempotencyKey: "magic-link/abc" },
    );
  });

  it("turns Resend's { error } result into a thrown error with a helpful log", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Silsilah <onboarding@resend.dev>");
    send.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        statusCode: 403,
        message: "You can only send testing emails to your own email address (owner@example.com).",
      },
    });
    const err = await sendEmail(email).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmailSendError);
    expect(err).toMatchObject({ code: "validation_error" });
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("Verify your domain at https://resend.com/domains");
    expect(logged).not.toContain("delivered@resend.dev"); // recipient is not logged
  });

  it("explains a bad API key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_wrong");
    vi.stubEnv("EMAIL_FROM", "Silsilah <noreply@silsilah.example>");
    send.mockResolvedValue({ data: null, error: { name: "invalid_api_key", statusCode: 403, message: "API key is invalid" } });
    await expect(sendEmail(email)).rejects.toMatchObject({ code: "invalid_api_key" });
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("https://resend.com/api-keys");
  });

  it("refuses to send without EMAIL_FROM instead of falling back to a test sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "");
    await expect(sendEmail(email)).rejects.toMatchObject({ code: "missing_from" });
    expect(send).not.toHaveBeenCalled();
  });

  it("requires a key on Vercel but prints the link locally", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("VERCEL", "1");
    await expect(sendEmail(email)).rejects.toMatchObject({ code: "missing_api_key" });
    vi.stubEnv("VERCEL", "");
    await expect(sendEmail(email)).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("builds short, stable idempotency keys", () => {
    const a = idempotencyKeyFor("magic-link", "https://x/callback?token=1");
    expect(a).toMatch(/^magic-link\/[0-9a-f]{40}$/);
    expect(idempotencyKeyFor("magic-link", "https://x/callback?token=1")).toBe(a);
    expect(idempotencyKeyFor("magic-link", "https://x/callback?token=2")).not.toBe(a);
  });
});
