import "server-only";
import { createHash } from "node:crypto";
import { Resend } from "resend";

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Resend idempotency key, `<event-type>/<entity-id>` (max 256 chars).
   * A retried send with the same key is not delivered twice.
   */
  idempotencyKey?: string;
};

/** Sending failed; `code` is Resend's error name, or our own config code. */
export class EmailSendError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

/**
 * Plain-language hints for the server log, keyed by Resend error names and
 * messages. These are the mistakes people actually hit when setting up Resend.
 */
function hintFor(name: string, message: string): string {
  if (/testing emails to your own email address/i.test(message)) {
    return "EMAIL_FROM uses Resend's test sender, which only delivers to the Resend account owner's address. Verify your domain at https://resend.com/domains and set EMAIL_FROM to an address on it.";
  }
  if (/domain is not verified|not verified/i.test(message) || name === "invalid_from_address") {
    return "The domain in EMAIL_FROM isn't verified in Resend. Finish verification at https://resend.com/domains, or fix EMAIL_FROM.";
  }
  if (name === "missing_api_key" || name === "invalid_api_key" || name === "restricted_api_key") {
    return "RESEND_API_KEY is missing, wrong, or lacks sending permission. Create a key with 'Sending access' at https://resend.com/api-keys and redeploy.";
  }
  if (name === "daily_quota_exceeded" || name === "monthly_quota_exceeded" || name === "rate_limit_exceeded") {
    return "Resend's sending limit was reached. Wait, or raise the limit in your Resend plan.";
  }
  return "See https://resend.com/docs/api-reference/errors";
}

let client: Resend | undefined;

/**
 * Sends through the Resend SDK. Without RESEND_API_KEY (local development,
 * tests) the message is printed to the server console instead, so sign-in
 * links can be clicked from the terminal. On Vercel both RESEND_API_KEY and
 * EMAIL_FROM are required.
 */
export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.VERCEL) {
      console.error("[email] RESEND_API_KEY is not set; no email can be sent.");
      throw new EmailSendError("missing_api_key", "RESEND_API_KEY is not set");
    }
    console.info(`\n[email] to=${email.to} subject="${email.subject}"\n${email.text}\n`);
    return;
  }

  // No built-in fallback sender: production mail must come from your verified domain.
  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.error("[email] EMAIL_FROM is not set. Use an address on a domain verified in Resend, e.g. \"Silsilah <noreply@yourdomain.com>\".");
    throw new EmailSendError("missing_from", "EMAIL_FROM is not set");
  }
  if (process.env.VERCEL_ENV === "production" && /@resend\.dev>?\s*$/i.test(from)) {
    console.warn("[email] EMAIL_FROM uses Resend's test sender; it only delivers to the Resend account owner's address.");
  }

  client ??= new Resend(apiKey);
  const { data, error } = await client.emails.send(
    { from, to: [email.to], subject: email.subject, html: email.html, text: email.text },
    email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined,
  );
  if (error) {
    // The recipient address is deliberately left out of the log.
    console.error(`[email] Resend refused the email (${error.name}): ${error.message}\n[email] Hint: ${hintFor(error.name, error.message)}`);
    throw new EmailSendError(error.name, error.message);
  }
  console.info(`[email] sent id=${data?.id}`);
}

/** Stable, short key derived from a value that is unique per send (e.g. a sign-in URL). */
export function idempotencyKeyFor(eventType: string, uniqueValue: string): string {
  return `${eventType}/${createHash("sha256").update(uniqueValue).digest("hex").slice(0, 40)}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
