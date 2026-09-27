"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { buildOutline, type OutlineNode } from "@/lib/review/outline";
import type { ReviewDraft } from "@/lib/review/draft";

type Shape = "pyramid" | "inverted";

/**
 * Live preview of the family structure while reviewing: one row per
 * generation, couples side by side, lines from parents to their children.
 * "Pyramid" puts the oldest generation at the top; "upside down" flips it.
 * Wide families scroll sideways inside the frame, starting centred on the
 * oldest couple.
 */
export function OutlineView({ draft, nameOf }: { draft: ReviewDraft; nameOf: (id: string) => string }) {
  const t = useTranslations("review");
  const { roots, alone } = useMemo(() => buildOutline(draft), [draft]);
  const [shape, setShape] = useState<Shape>("pyramid");
  const flip = shape === "inverted";
  const frame = useRef<HTMLDivElement>(null);
  const hasChart = roots.length > 0;

  useEffect(() => {
    const el = frame.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [shape, hasChart]);

  return (
    <section aria-labelledby="preview-h" className="flex flex-col gap-4">
      <h2 id="preview-h">{t("preview")}</h2>
      <p className="measure text-sm text-ink-muted">{t("previewHint")}</p>

      <div role="group" aria-label={t("previewShape")} className="inline-flex self-start overflow-hidden rounded-full border-3 border-ink shadow-neo-sm">
        {(["pyramid", "inverted"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={shape === s}
            onClick={() => setShape(s)}
            className={`min-h-11 cursor-pointer px-4 text-sm font-semibold ${shape === s ? "bg-accent text-paper" : "text-accent hover:bg-accent-tint"}`}
          >
            <span aria-hidden className="mr-2">{s === "pyramid" ? "▲" : "▼"}</span>
            {s === "pyramid" ? t("previewPyramid") : t("previewInverted")}
          </button>
        ))}
      </div>

      {hasChart && (
        <div ref={frame} className="overflow-x-auto rounded-card border-3 border-ink bg-paper p-4 sm:p-6">
          <div className="mx-auto flex w-max items-start gap-10 px-2 pb-2">
            {roots.map((n) => (
              <Branch key={n.people.join("+")} node={n} flip={flip} nameOf={nameOf} />
            ))}
          </div>
        </div>
      )}

      {alone.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="eyebrow">{t("unplaced")}</p>
          <p className="font-display text-xl">{alone.map(nameOf).join(" · ")}</p>
        </div>
      )}
    </section>
  );
}

/** A couple (or single person) with their children's branches below it, or above it when flipped. */
function Branch({ node, flip, nameOf }: { node: OutlineNode; flip: boolean; nameOf: (id: string) => string }) {
  const kids = node.children;
  return (
    <div className={`flex items-center ${flip ? "flex-col-reverse" : "flex-col"}`}>
      <div className="flex min-w-32 max-w-48 flex-col items-center rounded-field border-3 border-ink bg-mat px-3 py-2 text-center shadow-neo-xs">
        {node.people.map((id, i) => (
          <span key={id} className="font-display text-[1rem] font-bold leading-snug break-words">
            {i > 0 && (
              <span aria-hidden className="block text-sm font-normal text-ink-muted">
                =
              </span>
            )}
            {nameOf(id)}
          </span>
        ))}
      </div>

      {kids.length > 0 && (
        <>
          {/* Stem from the couple to the bar joining their children. */}
          <div aria-hidden className="h-5 w-[3px] bg-ink" />
          <ul className={`flex ${flip ? "items-end" : "items-start"}`}>
            {kids.map((child, i) => (
              <li key={child.people.join("+")} className={`relative px-3 ${flip ? "pb-5" : "pt-5"}`}>
                {/* Each child draws its half of the bar and its own drop, so the bar spans first to last child. */}
                {i > 0 && <span aria-hidden className={`absolute left-0 w-1/2 border-ink ${flip ? "bottom-0 border-b-3" : "top-0 border-t-3"}`} />}
                {i < kids.length - 1 && (
                  <span aria-hidden className={`absolute right-0 w-1/2 border-ink ${flip ? "bottom-0 border-b-3" : "top-0 border-t-3"}`} />
                )}
                <span aria-hidden className={`absolute left-1/2 h-5 w-[3px] -translate-x-1/2 bg-ink ${flip ? "bottom-0" : "top-0"}`} />
                <Branch node={child} flip={flip} nameOf={nameOf} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
