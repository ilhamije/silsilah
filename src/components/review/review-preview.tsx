"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { isAccepted, loadSession, type StoredPage } from "@/client/pages-store";
import { combinePages } from "@/lib/ai/combine";
import { extractionThresholds } from "@/lib/ai/classify";
import type { CombinedPerson } from "@/lib/ai/schema";
import { buttonClass, Notice } from "@/components/ui";

/**
 * Read-only preview of everything read from the photos. Phase 3 turns this
 * into the full review-and-correct screen with saving.
 */
export function ReviewPreview({ treeId }: { treeId: string }) {
  const t = useTranslations("review");
  const [pages, setPages] = useState<StoredPage[] | null>(null);

  useEffect(() => {
    loadSession(treeId).then((s) => setPages(s.pages));
  }, [treeId]);

  const combined = useMemo(
    () =>
      combinePages(
        (pages ?? [])
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => isAccepted(p))
          .map(({ p, i }) => ({ pageIndex: i, extraction: p.result!.extraction })),
      ),
    [pages],
  );
  if (!pages) return null;

  const byId = new Map(combined.people.map((p) => [p.temp_id, p]));
  const name = (id: string) => byId.get(id)?.full_name ?? "?";

  if (combined.people.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-ink-muted">{t("nothing")}</p>
        <Link href={`/trees/${treeId}/upload`} className={buttonClass("secondary", "self-start")}>
          {t("addPages")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-14">
      <Notice>{t("comingSoon")}</Notice>

      <section aria-labelledby="people-h" className="flex flex-col gap-4">
        <h2 id="people-h">
          {t("people")} <span className="text-ink-muted">({combined.people.length})</span>
        </h2>
        <ul className="flex flex-col border-t border-rule">
          {combined.people.map((p) => (
            <PersonRow key={p.temp_id} person={p} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="links-h" className="flex flex-col gap-4">
        <h2 id="links-h">
          {t("connections")} <span className="text-ink-muted">({combined.relationships.length})</span>
        </h2>
        <ul className="flex flex-col border-t border-rule">
          {combined.relationships.map((r) => (
            <li
              key={`${r.type}${r.from_temp_id}${r.to_temp_id}`}
              className={`border-b border-rule py-3 ${r.confidence < extractionThresholds.reviewFieldConfidence ? "bg-notice px-3 text-notice-ink" : ""}`}
            >
              {r.type === "parent_child"
                ? t("parentOf", { parent: name(r.from_temp_id), child: name(r.to_temp_id) })
                : t("spouseOf", { a: name(r.from_temp_id), b: name(r.to_temp_id) })}
              {r.confidence < extractionThresholds.reviewFieldConfidence && ` · ${t("lowConfidence")}`}
            </li>
          ))}
        </ul>
      </section>

      {(combined.unclearItems.length > 0 || combined.possibleDuplicates.length > 0) && (
        <section aria-labelledby="unclear-h" className="flex flex-col gap-4">
          <h2 id="unclear-h">{t("unclear")}</h2>
          <ul className="measure flex flex-col border-t border-rule">
            {combined.possibleDuplicates.map(([a, b]) => (
              <li key={a + b} className="border-b border-rule py-3">
                {t("possibleSame")}: {name(a)} ({t("pageShort", { n: byId.get(a)!.pages[0] + 1 })}) ·{" "}
                {name(b)} ({t("pageShort", { n: byId.get(b)!.pages[0] + 1 })})
              </li>
            ))}
            {combined.unclearItems.map((u, i) => (
              <li key={i} className="border-b border-rule py-3">
                <span className="text-ink-muted">{t("pageShort", { n: u.page + 1 })}</span> {u.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PersonRow({ person: p }: { person: CombinedPerson }) {
  const t = useTranslations("review");
  const low = (f: keyof CombinedPerson["field_confidence"]) =>
    (p.field_confidence[f] ?? 1) < extractionThresholds.reviewFieldConfidence;
  const flagged = p.illegible || low("full_name") || low("birth_date") || low("death_date");
  const details = [p.birth_date, p.death_date && `† ${p.death_date}`, p.birth_place].filter(Boolean).join(" · ");
  return (
    <li className={`flex flex-col gap-1 border-b border-rule py-4 ${flagged ? "bg-notice px-3" : ""}`}>
      <span className="font-serif text-2xl">{p.full_name}</span>
      <span className="text-sm text-ink-muted">
        {details}
        {details && " · "}
        {p.pages.map((n) => t("pageShort", { n: n + 1 })).join(", ")}
      </span>
      {flagged && (
        <span className="text-sm font-semibold text-notice-ink">
          {p.illegible ? t("illegible") : t("lowConfidence")}
        </span>
      )}
    </li>
  );
}
