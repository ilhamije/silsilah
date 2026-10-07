import type { Locale } from "@/i18n/config";
import { escapeHtml } from "./send";

const copy = {
  en: {
    subject: "Sign in to Silsilah",
    intro: "Tap the button below to sign in. The link works once and expires in one hour.",
    button: "Sign in",
    ignore: "If you didn't ask for this, you can ignore this email.",
  },
  id: {
    subject: "Masuk ke Silsilah",
    intro: "Ketuk tombol di bawah untuk masuk. Tautan hanya bisa dipakai sekali dan berlaku satu jam.",
    button: "Masuk",
    ignore: "Jika Anda tidak memintanya, abaikan email ini.",
  },
} as const;

export function magicLinkEmail(url: string, locale: Locale) {
  const t = copy[locale];
  const safeUrl = escapeHtml(url);
  return {
    subject: t.subject,
    text: `${t.intro}\n\n${url}\n\n${t.ignore}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
  <h1 style="font-size:20px">Silsilah</h1>
  <p>${t.intro}</p>
  <p><a href="${safeUrl}" style="display:inline-block;background:#166534;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${t.button}</a></p>
  <p style="color:#555;font-size:14px">${t.ignore}</p>
</div>`,
  };
}

const inviteCopy = {
  en: {
    subject: (tree: string) => `You're invited to "${tree}" on Silsilah`,
    intro: (who: string, tree: string, role: string) =>
      `${who} invited you to the family tree "${tree}" as ${role}.`,
    button: "Open the invitation",
    expiry: "The link is personal to this email address and expires soon.",
    roles: { OWNER: "an owner", EDITOR: "an editor", VIEWER: "a viewer" },
  },
  id: {
    subject: (tree: string) => `Anda diundang ke "${tree}" di Silsilah`,
    intro: (who: string, tree: string, role: string) =>
      `${who} mengundang Anda ke silsilah keluarga "${tree}" sebagai ${role}.`,
    button: "Buka undangan",
    expiry: "Tautan ini khusus untuk alamat email ini dan segera kedaluwarsa.",
    roles: { OWNER: "pemilik", EDITOR: "penyunting", VIEWER: "pembaca" },
  },
} as const;

export function inviteEmail(
  url: string,
  treeName: string,
  inviter: string,
  role: "OWNER" | "EDITOR" | "VIEWER",
  locale: Locale,
) {
  const t = inviteCopy[locale];
  const intro = t.intro(inviter, treeName, t.roles[role]);
  return {
    subject: t.subject(treeName),
    text: `${intro}\n\n${url}\n\n${t.expiry}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
  <h1 style="font-size:20px">Silsilah</h1>
  <p>${escapeHtml(intro)}</p>
  <p><a href="${escapeHtml(url)}" style="display:inline-block;background:#166534;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${t.button}</a></p>
  <p style="color:#555;font-size:14px">${t.expiry}</p>
</div>`,
  };
}
