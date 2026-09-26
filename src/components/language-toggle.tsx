"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import { locales } from "@/i18n/config";

const labels = { en: "EN", id: "ID" } as const;
const names = { en: "English", id: "Bahasa Indonesia" } as const;

export function LanguageToggle() {
  const current = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label={t("language")} className="flex rounded-xl border border-border bg-surface p-0.5">
      {locales.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={active}
            aria-label={names[locale]}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setLocale(locale);
                router.refresh();
              })
            }
            className={`min-h-10 min-w-11 rounded-lg px-2 text-sm font-semibold ${
              active ? "bg-brand text-brand-fg" : "text-muted hover:text-foreground"
            }`}
          >
            {labels[locale]}
          </button>
        );
      })}
    </div>
  );
}
