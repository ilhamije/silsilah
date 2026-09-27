"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { reviewSuggestionAction } from "@/app/trees/[treeId]/actions";
import { Button, Notice } from "@/components/ui";
import { errorMessage, type TreePerson } from "./types";

export type PendingSuggestion = {
  id: string;
  personId: string;
  submittedBy: string;
  /** Already formatted on the server ("1 hour ago"), so server and browser agree. */
  when: string;
  changes: Record<string, unknown>;
};

const FIELD_LABEL: Record<string, string> = {
  fullName: "fullName",
  gender: "gender",
  birthDate: "birthDate",
  deathDate: "deathDate",
  birthPlace: "birthPlace",
  notes: "notes",
  livingOverride: "living",
  givenName: "givenName",
  familyName: "familyName",
  nicknames: "nicknames",
};

/** Editors' list of changes suggested by viewers: current value → suggested value, approve or reject. */
export function SuggestionsList({ treeId, items, people }: { treeId: string; items: PendingSuggestion[]; people: TreePerson[] }) {
  const t = useTranslations("tree");
  const r = useTranslations("review");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!items.length) return null;

  const show = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (field === "gender") return r(value === "MALE" ? "male" : value === "FEMALE" ? "female" : "unknown");
    if (field === "livingOverride") return r(value === true ? "livingYes" : value === false ? "livingNo" : "livingAuto");
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  };
  const currentOf = (p: TreePerson | undefined, field: string): unknown =>
    !p ? null : field === "livingOverride" ? (p.livingIsManual ? p.isLiving : null) : (p as Record<string, unknown>)[field];

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    setError(null);
    const res = await reviewSuggestionAction(treeId, id, approve);
    setBusy(null);
    if (!res.ok) return setError(errorMessage(t, res.error));
    router.refresh();
  }

  return (
    <section aria-labelledby="suggestions-h" className="flex flex-col gap-5">
      <h2 id="suggestions-h">{t("suggestionsTitle", { count: items.length })}</h2>
      {error && (
        <Notice tone="notice" role="alert">
          {error}
        </Notice>
      )}
      <ul className="flex flex-col gap-5">
        {items.map((s) => {
          const person = people.find((p) => p.id === s.personId);
          return (
            <li key={s.id} className="neo-card flex flex-col gap-4 p-5">
              <p>
                {t.rich("suggestionBy", {
                  who: s.submittedBy,
                  name: person?.fullName ?? "?",
                  when: s.when,
                  b: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
                {Object.entries(s.changes).map(([field, value]) => (
                  <div key={field} className="contents">
                    <dt className="font-semibold">{FIELD_LABEL[field] ? r(FIELD_LABEL[field]) : field}</dt>
                    <dd>
                      <span className="text-ink-muted line-through decoration-1">{show(field, currentOf(person, field))}</span>
                      <span aria-hidden> → </span>
                      <span className="sr-only">{t("suggestedValue")}</span>
                      <span className="font-semibold">{show(field, value)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-3">
                <Button type="button" disabled={busy === s.id} onClick={() => decide(s.id, true)}>
                  {t("approve")}
                </Button>
                <Button type="button" variant="secondary" disabled={busy === s.id} onClick={() => decide(s.id, false)}>
                  {t("reject")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
