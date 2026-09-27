"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import { locales } from "@/i18n/config";

const labels = { en: "English", id: "Indonesia" } as const;
const short = { en: "EN", id: "ID" } as const;

/**
 * Always at the top of the page. The current language is a filled Heritage
 * Blue segment; the other is outlined, so the choice is clear without colour.
 */
export function LanguageToggle() {
  const current = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label={t("language")} className="inline-flex rounded-[4px] border-[1.5px] border-accent">
      {locales.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={active}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setLocale(locale);
                router.refresh();
              })
            }
            className={`min-h-11 min-w-12 cursor-pointer px-3 text-sm font-semibold transition-colors ${
              active ? "bg-accent text-white" : "bg-transparent text-accent hover:bg-accent-tint hover:underline hover:underline-offset-4"
            }`}
          >
            <span aria-hidden className="sm:hidden">{short[locale]}</span>
            <span className="sr-only sm:not-sr-only">{labels[locale]}</span>
          </button>
        );
      })}
    </div>
  );
}
