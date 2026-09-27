"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { isAccepted, type StoredPage } from "@/client/pages-store";
import { useObjectUrl } from "@/client/use-object-url";
import type { ReviewDraft } from "@/lib/review/draft";
import { AlbumFrame } from "@/components/ui";

type Props = {
  pages: StoredPage[];
  draft: ReviewDraft;
  focusId: string | null;
};

/**
 * The original photo next to the data, with the focused person's name outlined.
 * Rendered with key={focusId}, so a new focus resets any page the user picked.
 */
export function PhotoPanel({ pages, draft, focusId }: Props) {
  const t = useTranslations("review");
  const readable = pages.map((p, i) => ({ p, i })).filter(({ p }) => isAccepted(p));
  const focused = draft.people.find((p) => p.id === focusId) ?? null;
  const [chosen, setChosen] = useState<number | null>(null);
  // Follow the focused person to their page, unless the user picked a page since.
  const pageIndex = chosen ?? focused?.pages[0] ?? readable[0]?.i ?? 0;
  const page = pages[pageIndex];
  const url = useObjectUrl(page?.blob);
  const box = focused && focused.pages[0] === pageIndex ? focused.bbox : null;

  return (
    <section aria-label={t("viewPhoto")} className="flex flex-col gap-4">
      {readable.length > 1 && (
        <div role="group" aria-label={t("viewPhoto")} className="flex flex-wrap gap-2">
          {readable.map(({ i }) => (
            <button
              key={i}
              type="button"
              aria-pressed={i === pageIndex}
              onClick={() => setChosen(i)}
              className={`min-h-11 cursor-pointer rounded-full border-3 border-ink px-4 text-sm font-semibold ${
                i === pageIndex ? "bg-accent text-paper" : "text-accent hover:bg-accent-tint"
              }`}
            >
              {t("photoPage", { n: i + 1 })}
            </button>
          ))}
        </div>
      )}

      <AlbumFrame>
        {url ? (
          <div className="relative mx-auto w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img src={url} alt={t("photoPage", { n: pageIndex + 1 })} className="block max-h-[75dvh] w-auto" />
            {box && (
              <div
                role="img"
                aria-label={t("highlightLabel", { name: focused!.fullName })}
                className="pointer-events-none absolute rounded-md border-4 border-orange bg-orange/15 shadow-[0_0_0_2px_#000]"
                style={{
                  left: `${Math.max(0, box[0] - 0.01) * 100}%`,
                  top: `${Math.max(0, box[1] - 0.01) * 100}%`,
                  width: `${Math.min(1, box[2] + 0.02) * 100}%`,
                  height: `${Math.min(1, box[3] + 0.02) * 100}%`,
                }}
              />
            )}
          </div>
        ) : (
          <p className="text-ink-muted">{t("noPhoto")}</p>
        )}
      </AlbumFrame>
      {focused && (
        <p className="text-center font-display text-xl italic">
          {focused.fullName} · {t("photoPage", { n: pageIndex + 1 })}
        </p>
      )}
    </section>
  );
}
