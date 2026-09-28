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
  /** The viewer's own person ("This is me"), on a pastel blue card. */
  selfId?: string | null;
  /** Scroll this person's card to the middle of the view; a new object each time it's asked for. */
  centerOn?: { id: string } | null;
};

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5] as const;

type Line = { x1: number; y1: number; x2: number; y2: number; kind: "lineage" | "siblings" };

/**
 * A family chart: one row per generation, one card per person (the viewer's
 * own in pastel blue). Husband and wife are joined by a red line; a green line runs from the couple to each
 * child's card, and a black bar joins brothers and sisters. "Pyramid" puts the
 * oldest generation at the top; "upside down" flips it. Wide families scroll
 * sideways inside the frame, starting centred on the oldest couple.
 */
export function FamilyChart({ people, relationships, nameOf, detailOf, onSelect, selectedId, selfId, centerOn }: Props) {
  const t = useTranslations("chart");
  const { roots, alone } = useMemo(() => buildOutline({ people, relationships }), [people, relationships]);
  const [shape, setShape] = useState<Shape>("pyramid");
  const flip = shape === "inverted";
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<Line[]>([]);
  const [zoomAt, setZoomAt] = useState(ZOOMS.indexOf(1));
  const zoom = ZOOMS[zoomAt];
  // Where the middle of the view was (0..1 across the chart), kept while zooming.
  const focus = useRef<number | null>(null);
  const hasChart = roots.length > 0;

  useEffect(() => {
    const el = frame.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [shape, hasChart]);

  useEffect(() => {
    const el = frame.current;
    if (!el || focus.current === null) return;
    el.scrollLeft = focus.current * el.scrollWidth - el.clientWidth / 2;
    focus.current = null;
  }, [zoom]);

  useEffect(() => {
    if (centerOn) cards.current.get(centerOn.id)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [centerOn]);

  const zoomTo = (at: number) => {
    const el = frame.current;
    if (el) focus.current = (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth;
    setZoomAt(Math.min(ZOOMS.length - 1, Math.max(0, at)));
  };

  // Lines are drawn from where the cards actually are, so they follow names that wrap and fonts that load late.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setLines(connectorLines(roots, relationships, flip, el, cards.current)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [roots, relationships, flip, zoom]);

  const card = {
    nameOf,
    detailOf,
    onSelect,
    selectedId,
    selfId,
    cardRef: (id: string) => (node: HTMLElement | null) => {
      if (node) cards.current.set(id, node);
      else cards.current.delete(id);
    },
  };

  return (
    <div className="flex flex-col gap-4">
      {hasChart && (
        <>
          <div className="flex flex-wrap items-center gap-3">
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

            <div role="group" aria-label={t("zoom")} className="inline-flex overflow-hidden rounded-full border-3 border-ink shadow-neo-sm">
              <button
                type="button"
                aria-label={t("zoomOut")}
                disabled={zoomAt === 0}
                onClick={() => zoomTo(zoomAt - 1)}
                className="min-h-11 min-w-11 cursor-pointer text-xl font-bold text-accent hover:bg-accent-tint disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              >
                −
              </button>
              <button
                type="button"
                aria-label={t("zoomReset")}
                onClick={() => zoomTo(ZOOMS.indexOf(1))}
                className="min-h-11 min-w-16 cursor-pointer border-x-3 border-ink px-2 text-sm font-semibold tabular-nums text-accent hover:bg-accent-tint"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                aria-label={t("zoomIn")}
                disabled={zoomAt === ZOOMS.length - 1}
                onClick={() => zoomTo(zoomAt + 1)}
                className="min-h-11 min-w-11 cursor-pointer text-xl font-bold text-accent hover:bg-accent-tint disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              >
                +
              </button>
            </div>
          </div>

          <div ref={frame} className="overflow-x-auto rounded-card border-3 border-ink bg-paper p-4 sm:p-6">
            <div ref={canvas} style={{ zoom }} className="relative mx-auto flex w-max items-start gap-10 px-2 pb-2">
              <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                {lines.map(({ kind, ...xy }, i) => (
                  <line key={i} {...xy} strokeWidth={3} strokeLinecap="square" className={kind === "lineage" ? "stroke-lineage" : "stroke-ink"} />
                ))}
              </svg>
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

/**
 * For each couple with children: a green stem from the middle of the couple's
 * red line (or from a single parent's card) to a bar halfway down, a black bar
 * across the brothers and sisters, and a green drop to the middle of each
 * child's own card edge (top, or bottom when flipped). An only child's bar is
 * green too, since it only joins parent and child.
 *
 * Everyone appears once, so a child married to someone from another branch is
 * drawn beside their spouse, away from their own parents. Their parents' line
 * goes across to them, running just above their card (below the sibling bars).
 */
function connectorLines(
  roots: OutlineNode[],
  edges: ChartEdge[],
  flip: boolean,
  canvas: HTMLElement,
  cards: Map<string, HTMLElement>,
) {
  const origin = canvas.getBoundingClientRect();
  // Screen positions include the chart's zoom; the SVG inside it is zoomed too, so draw in unzoomed units.
  const scale = canvas.offsetWidth ? origin.width / canvas.offsetWidth : 1;
  const box = (id: string) => {
    const r = cards.get(id)?.getBoundingClientRect();
    return (
      r && {
        left: (r.left - origin.left) / scale,
        right: (r.right - origin.left) / scale,
        top: (r.top - origin.top) / scale,
        bottom: (r.bottom - origin.top) / scale,
      }
    );
  };
  const lines: Line[] = [];
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) if (e.type === "PARENT_CHILD") childrenOf.set(e.from, [...(childrenOf.get(e.from) ?? []), e.to]);

  const walk = (node: OutlineNode) => {
    node.children.forEach(walk);
    const near = node.children.map((c) => c.people[0]);
    const far = [...new Set(node.people.flatMap((p) => childrenOf.get(p) ?? []))].filter((id) => !near.includes(id));
    const parents = node.people.map(box);
    const kids = near.map(box);
    if (parents.some((p) => !p) || kids.some((k) => !k)) return;
    const ps = parents as NonNullable<(typeof parents)[number]>[];
    const ks = kids as NonNullable<(typeof kids)[number]>[];

    // Couples: from the middle of the red line between the first two cards. Single parent: from the card's edge.
    const [a, b] = ps;
    const stemX = b ? (a.right + b.left) / 2 : (a.left + a.right) / 2;
    const stemY = b ? (a.top + a.bottom) / 2 : flip ? a.top : a.bottom;

    for (const id of far) {
      const k = box(id);
      if (!k) continue;
      const kx = (k.left + k.right) / 2;
      const ky = flip ? k.bottom : k.top;
      const y = flip ? ky + FAR_OFFSET : ky - FAR_OFFSET;
      lines.push({ x1: stemX, y1: stemY, x2: stemX, y2: y, kind: "lineage" });
      lines.push({ x1: stemX, y1: y, x2: kx, y2: y, kind: "lineage" });
      lines.push({ x1: kx, y1: y, x2: kx, y2: ky, kind: "lineage" });
    }
    if (!ks.length) return;
    const parentEdge = flip ? Math.min(...ps.map((p) => p.top)) : Math.max(...ps.map((p) => p.bottom));
    const kidEdge = flip ? Math.max(...ks.map((k) => k.bottom)) : Math.min(...ks.map((k) => k.top));
    const barY = (parentEdge + kidEdge) / 2;
    const kidXs = ks.map((k) => (k.left + k.right) / 2);

    lines.push({ x1: stemX, y1: stemY, x2: stemX, y2: barY, kind: "lineage" });
    const from = Math.min(stemX, ...kidXs);
    const to = Math.max(stemX, ...kidXs);
    if (to - from > 1) lines.push({ x1: from, y1: barY, x2: to, y2: barY, kind: ks.length > 1 ? "siblings" : "lineage" });
    ks.forEach((k, i) => {
      lines.push({ x1: kidXs[i], y1: barY, x2: kidXs[i], y2: flip ? k.bottom : k.top, kind: "lineage" });
    });
  };
  roots.forEach(walk);
  return lines;
}

/** How far above a child's card a line from parents in another branch runs; sibling bars sit at 20px. */
const FAR_OFFSET = 10;

type CardProps = Omit<Props, "people" | "relationships"> & {
  cardRef?: (id: string) => (node: HTMLElement | null) => void;
};

/** A couple (or single person) with their children's branches below it, or above it when flipped. Lines are drawn by FamilyChart. */
function Branch({ node, flip, card }: { node: OutlineNode; flip: boolean; card: CardProps }) {
  const kids = node.children;
  return (
    <div className={`flex items-center ${flip ? "flex-col-reverse" : "flex-col"}`}>
      <Card people={node.people} {...card} />

      {kids.length > 0 && (
        <ul className={`flex ${flip ? "items-end pb-10" : "items-start pt-10"}`}>
          {kids.map((child) => (
            <li key={child.people.join("+")} className="px-3">
              <Branch node={child} flip={flip} card={card} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A couple (or single person): one card per person, spouses joined by a red line. Cards are tappable when the chart is interactive. */
function Card({ people, nameOf, detailOf, onSelect, selectedId, selfId, cardRef }: CardProps & { people: string[] }) {
  return (
    <div className="flex items-center">
      {people.map((id, i) => {
        const detail = detailOf?.(id);
        const body = (
          <>
            <span className="font-display text-[1rem] font-bold leading-snug break-words">{nameOf(id)}</span>
            {detail && <span className="block text-sm text-ink-muted">{detail}</span>}
          </>
        );
        const box = "flex min-h-11 w-full flex-col items-center justify-center rounded-field border-3 border-ink px-3 py-1.5 text-center shadow-neo-xs";
        const fill = id === selfId ? "bg-self" : "bg-mat";
        return (
          <div key={id} className="flex items-center">
            {i > 0 && <span aria-hidden className="h-[3px] w-6 shrink-0 bg-married" />}
            <div ref={cardRef?.(id)} className="relative min-w-32 max-w-48">
              {onSelect ? (
                <button
                  type="button"
                  aria-pressed={selectedId === id}
                  onClick={() => onSelect(id)}
                  className={`${box} cursor-pointer ${selectedId === id ? "bg-pink text-on-brand" : `${fill} hover:bg-accent-tint`}`}
                >
                  {body}
                </button>
              ) : (
                <div className={`${box} ${fill}`}>{body}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
