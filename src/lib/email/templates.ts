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
