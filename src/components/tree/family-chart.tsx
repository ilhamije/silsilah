"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { buildOutline, type OutlineNode } from "@/lib/review/outline";

type Shape = "pyramid" | "inverted";

export type ChartPerson = { id: string };
export type ChartEdge = { type: "PARENT_CHILD" | "SPOUSE"; from: string; to: string };

type Props = {
  people: ChartPerson[];
  relationships: ChartEdge[];
  nameOf: (id: string) => string;
  /** Optional second line under a name, e.g. years. */
  detailOf?: (id: string) => string | null;
  /** When set, each person is a button; the chosen one is highlighted. */
  onSelect?: (id: string) => void;
  selectedId?: string | null;
};

/**
 * A family chart: one row per generation, couples in one card, lines from
 * parents to their children. "Pyramid" puts the oldest generation at the top;
 * "upside down" flips it. Wide families scroll sideways inside the frame,
 * starting centred on the oldest couple.
 */
export function FamilyChart({ people, relationships, nameOf, detailOf, onSelect, selectedId }: Props) {
  const t = useTranslations("chart");
  const { roots, alone } = useMemo(() => buildOutline({ people, relationships }), [people, relationships]);
  const [shape, setShape] = useState<Shape>("pyramid");
  const flip = shape === "inverted";
  const frame = useRef<HTMLDivElement>(null);
  const hasChart = roots.length > 0;

  useEffect(() => {
    const el = frame.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [shape, hasChart]);

  const card = { nameOf, detailOf, onSelect, selectedId };

  return (
    <div className="flex flex-col gap-4">
      {hasChart && (
        <>
          <div role="group" aria-label={t("shape")} className="inline-flex self-start overflow-hidden rounded-full border-3 border-ink shadow-neo-sm">
            {(["pyramid", "inverted"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={shape === s}
                onClick={() => setShape(s)}
                className={`min-h-11 cursor-pointer px-4 text-sm font-semibold ${shape === s ? "bg-accent text-paper" : "text-accent hover:bg-accent-tint"}`}
              >
                <span aria-hidden className="mr-2">
                  {s === "pyramid" ? "▲" : "▼"}
                </span>
                {s === "pyramid" ? t("pyramid") : t("inverted")}
              </button>
            ))}
          </div>

          <div ref={frame} className="overflow-x-auto rounded-card border-3 border-ink bg-paper p-4 sm:p-6">
            <div className="mx-auto flex w-max items-start gap-10 px-2 pb-2">
              {roots.map((n) => (
                <Branch key={n.people.join("+")} node={n} flip={flip} card={card} />
              ))}
            </div>
          </div>
        </>
      )}

      {alone.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="eyebrow">{t("unplaced")}</p>
          <div className="flex flex-wrap gap-3">
            {alone.map((id) => (
              <Card key={id} people={[id]} {...card} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type CardProps = Omit<Props, "people" | "relationships">;

/** A couple (or single person) with their children's branches below it, or above it when flipped. */
function Branch({ node, flip, card }: { node: OutlineNode; flip: boolean; card: CardProps }) {
  const kids = node.children;
  return (
    <div className={`flex items-center ${flip ? "flex-col-reverse" : "flex-col"}`}>
      <Card people={node.people} {...card} />

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
                <Branch node={child} flip={flip} card={card} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** One card per couple; each person in it is tappable when the chart is interactive. */
function Card({ people, nameOf, detailOf, onSelect, selectedId }: CardProps & { people: string[] }) {
  return (
    <div className="flex min-w-32 max-w-48 flex-col items-stretch overflow-hidden rounded-field border-3 border-ink bg-mat text-center shadow-neo-xs">
      {people.map((id, i) => {
        const detail = detailOf?.(id);
        const body = (
          <>
            <span className="font-display text-[1rem] font-bold leading-snug break-words">{nameOf(id)}</span>
            {detail && <span className="block text-sm text-ink-muted">{detail}</span>}
          </>
        );
        return (
          <div key={id}>
            {i > 0 && (
              <span aria-hidden className="block text-sm leading-none text-ink-muted">
                =
              </span>
            )}
            {onSelect ? (
              <button
                type="button"
                aria-pressed={selectedId === id}
                onClick={() => onSelect(id)}
                className={`flex min-h-11 w-full cursor-pointer flex-col items-center justify-center px-3 py-1.5 ${
                  selectedId === id ? "bg-pink text-on-brand" : "hover:bg-accent-tint"
                }`}
              >
                {body}
              </button>
            ) : (
              <div className="px-3 py-1.5">{body}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
