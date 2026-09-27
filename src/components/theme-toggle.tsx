"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setTheme } from "@/app/actions/theme";
import { themes, type Theme } from "@/lib/theme";

const glyph = { light: "☀", dim: "☾" } as const;
const themeLabel = { light: "themeLight", dim: "themeDim" } as const;

/**
 * Light / Dim switch beside the language toggle. Dim is the same theme with
 * less glare for evenings. Like the language toggle, the current choice is a
 * filled segment, so it's clear without relying on colour.
 */
export function ThemeToggle({ current }: { current: Theme }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label={t("theme")} className="inline-flex overflow-hidden rounded-full border-3 border-ink shadow-neo-sm">
      {themes.map((theme) => {
        const active = theme === current;
        return (
          <button
            key={theme}
            type="button"
            aria-pressed={active}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                // Switch at once, then persist; the refresh re-renders with the cookie.
                document.documentElement.dataset.theme = theme;
                await setTheme(theme);
                router.refresh();
              })
            }
            className={`min-h-11 min-w-12 cursor-pointer px-4 text-sm font-semibold transition-colors ${
              active ? "bg-accent text-paper" : "bg-transparent text-accent hover:bg-accent-tint hover:underline hover:underline-offset-4"
            }`}
          >
            <span aria-hidden className="text-lg sm:hidden">{glyph[theme]}</span>
            <span className="sr-only sm:not-sr-only">{t(themeLabel[theme])}</span>
          </button>
        );
      })}
    </div>
  );
}
