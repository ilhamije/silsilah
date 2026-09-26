import "server-only";

export type Email = { to: string; subject: string; html: string; text: string };

/**
 * Sends through Resend's HTTP API. Without RESEND_API_KEY (local dev, tests,
 * local `next start`) the message is printed to the server console instead,
 * so magic links can be clicked from the terminal. On Vercel the key is required.
 */
export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.VERCEL) {
      throw new Error("RESEND_API_KEY is not set");
    }
    console.info(`\n[email] to=${email.to} subject="${email.subject}"\n${email.text}\n`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Silsilah <onboarding@resend.dev>",
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
