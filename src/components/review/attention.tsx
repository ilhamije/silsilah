"use client";

import { useTranslations } from "next-intl";
import {
  dismissPair,
  duplicatePrompts,
  linkExisting,
  mergePeople,
  type DraftIssue,
  type ExistingPerson,
  type ReviewDraft,
} from "@/lib/review/draft";
import { Button, Notice } from "@/components/ui";
import type { ApplyDraft } from "./review-workspace";

type Props = {
  draft: ReviewDraft;
  apply: ApplyDraft;
  existingPeople: ExistingPerson[];
  issues: DraftIssue[];
  toCheck: number;
  nameOf: (id: string) => string;
};

/** Everything the user should look at before saving, in one place at the top. */
export function Attention({ draft, apply, existingPeople, issues, toCheck, nameOf }: Props) {
  const t = useTranslations("review");
  const prompts = duplicatePrompts(draft, existingPeople);
  const label = (id: string) => {
    const p = draft.people.find((x) => x.id === id);
    return [p?.fullName || t("newPersonName"), p?.birthDate].filter(Boolean).join(", ");
  };

  const issueText = (i: DraftIssue) => {
    switch (i.code) {
      case "empty_name":
        return t("issue_empty_name");
      case "no_people":
        return t("issue_no_people");
      case "cycle":
        return t("issue_cycle", { names: i.people.map(nameOf).join(" → ") });
      case "too_many_parents":
        return t("issue_too_many_parents", { name: nameOf(i.people[0]) });
      case "self_link":
        return t("issue_self_link", { name: nameOf(i.people[0]) });
    }
  };

  return (
    <section aria-labelledby="attention-h" className="flex flex-col gap-5">
      <h2 id="attention-h">{t("attentionTitle")}</h2>

      {issues.length > 0 && (
        <Notice tone="notice" role="alert">
          <ul className="list-disc pl-5">
            {issues.map((i, n) => (
              <li key={n}>{issueText(i)}</li>
            ))}
          </ul>
        </Notice>
      )}

      <p className="measure text-ink-muted">
        {toCheck > 0 ? t("attentionCount", { count: toCheck }) : issues.length === 0 && prompts.length === 0 ? t("attentionNone") : null}
      </p>

      {prompts.length > 0 && (
        <ul className="flex flex-col border-t border-rule">
          {prompts.map((q) => (
            <li key={q.kind === "draft" ? `${q.a}|${q.b}` : `${q.a}|${q.existing.id}`} className="flex flex-col gap-3 border-b border-rule py-5">
              {q.kind === "draft" ? (
                <>
                  <p className="font-semibold">{t("samePersonQ")}</p>
                  <p className="font-serif text-2xl">
                    {label(q.a)} <span className="text-ink-muted">·</span> {label(q.b)}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" variant="secondary" onClick={() => apply((d) => mergePeople(d, q.a, q.b))}>
                      {t("sameYes")}
                    </Button>
                    <Button type="button" variant="quiet" onClick={() => apply((d) => dismissPair(d, q.a, q.b))}>
                      {t("sameNo")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-semibold">{t("existingQ", { name: q.existing.fullName })}</p>
                  <p className="font-serif text-2xl">
                    {label(q.a)} <span className="text-ink-muted">·</span>{" "}
                    {[q.existing.fullName, q.existing.birthDate].filter(Boolean).join(", ")}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" variant="secondary" onClick={() => apply((d) => linkExisting(d, q.a, q.existing.id))}>
                      {t("existingYes")}
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      onClick={() => apply((d) => dismissPair(d, q.a, `existing:${q.existing.id}`))}
                    >
                      {t("sameNo")}
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
