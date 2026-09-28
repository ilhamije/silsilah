"use client";

import { useTranslations } from "next-intl";
import { SELF_REF, type ReviewDraft } from "@/lib/review/draft";
import { FamilyChart } from "@/components/tree/family-chart";

/** Live chart of the family structure while reviewing. */
export function OutlineView({ draft, nameOf }: { draft: ReviewDraft; nameOf: (id: string) => string }) {
  const t = useTranslations("review");
  return (
    <section aria-labelledby="preview-h" className="flex flex-col gap-4">
      <h2 id="preview-h">{t("preview")}</h2>
      <p className="measure text-sm text-ink-muted">{t("previewHint")}</p>
      <FamilyChart
        people={draft.people}
        relationships={draft.relationships}
        nameOf={nameOf}
        selfId={draft.people.some((p) => p.id === SELF_REF) ? SELF_REF : null}
      />
    </section>
  );
}
