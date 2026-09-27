"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { buildOutline, type OutlineNode } from "@/lib/review/outline";
import type { ReviewDraft } from "@/lib/review/draft";

/** Live, text-only preview of the family structure while reviewing. */
export function OutlineView({ draft, nameOf }: { draft: ReviewDraft; nameOf: (id: string) => string }) {
  const t = useTranslations("review");
  const { roots, alone } = useMemo(() => buildOutline(draft), [draft]);

  const render = (nodes: OutlineNode[], depth = 0) => (
    <ul className={depth ? "ml-3 flex flex-col gap-2 border-l border-rule pl-4 sm:ml-5 sm:pl-6" : "flex flex-col gap-3"}>
      {nodes.map((n) => (
        <li key={n.people.join("+")} className="flex flex-col gap-2">
          <span className="font-display text-xl">
            {n.people.map((id, i) => (
              <span key={id}>
                {i > 0 && <span className="text-ink-muted"> = </span>}
                {nameOf(id)}
              </span>
            ))}
          </span>
          {n.children.length > 0 && render(n.children, depth + 1)}
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="preview-h" className="flex flex-col gap-4">
      <h2 id="preview-h">{t("preview")}</h2>
      <p className="measure text-sm text-ink-muted">{t("previewHint")}</p>
      <div className="border-t border-rule pt-5">{render(roots)}</div>
      {alone.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="eyebrow">{t("unplaced")}</p>
          <p className="font-display text-xl">{alone.map(nameOf).join(" · ")}</p>
        </div>
      )}
    </section>
  );
}
