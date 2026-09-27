"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { clearSession, isAccepted, loadSession, saveSession, type ImportSession } from "@/client/pages-store";
import { combinePages } from "@/lib/ai/combine";
import {
  buildDraft,
  personNeedsCheck,
  relationshipNeedsCheck,
  toImportPayload,
  validateDraft,
  type ExistingPerson,
  type ReviewDraft,
} from "@/lib/review/draft";
import type { Edge } from "@/lib/tree/graph";
import { Button, buttonClass, Notice } from "@/components/ui";
import { Attention } from "./attention";
import { Connections } from "./connections";
import { OutlineView } from "./outline-view";
import { PeopleList } from "./people-list";
import { PhotoPanel } from "./photo-panel";

type Props = {
  treeId: string;
  treeName: string;
  existingPeople: ExistingPerson[];
  existingEdges: Edge[];
};

export type ApplyDraft = (change: (d: ReviewDraft) => ReviewDraft) => void;

const makeImportId = () => `imp_${crypto.randomUUID().replace(/-/g, "")}`;

/** Identifies which page readings a draft was built from. */
function basisOf(session: ImportSession) {
  return session.pages
    .map((p, i) => (isAccepted(p) ? `${i}:${p.id}:${p.result!.extraction.people.length}` : ""))
    .filter(Boolean)
    .join(",");
}

export function ReviewWorkspace({ treeId, treeName, existingPeople, existingEdges }: Props) {
  const t = useTranslations("review");
  const router = useRouter();
  const [session, setSession] = useState<ImportSession | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [rebuilt, setRebuilt] = useState(false);
  const [view, setView] = useState<"details" | "photo">("details");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sessionRef = useRef<ImportSession | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSession(treeId).then((s) => {
      const basis = basisOf(s);
      let next = s;
      if (basis && (!s.draft || s.draft.basis !== basis)) {
        const accepted = s.pages
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => isAccepted(p))
          .map(({ p, i }) => ({ pageIndex: i, extraction: p.result!.extraction }));
        setRebuilt(!!s.draft);
        next = { ...s, draft: buildDraft(combinePages(accepted), basis), importId: makeImportId() };
        void saveSession(next);
      }
      sessionRef.current = next;
      setSession(next);
      setDraft(basis ? (next.draft ?? null) : null);
    });
  }, [treeId]);

  /** Every edit goes through here: update state, then autosave shortly after. */
  const apply: ApplyDraft = useCallback((change) => {
    setDraft((current) => {
      if (!current) return current;
      const next = change(current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (sessionRef.current) {
          sessionRef.current = { ...sessionRef.current, draft: next };
          void saveSession(sessionRef.current);
        }
      }, 300);
      return next;
    });
  }, []);

  const issues = useMemo(() => (draft ? validateDraft(draft, existingEdges) : []), [draft, existingEdges]);
  const toCheck = useMemo(
    () =>
      draft
        ? draft.people.filter(personNeedsCheck).length + draft.relationships.filter(relationshipNeedsCheck).length
        : 0,
    [draft],
  );

  const showOnPhoto = (id: string) => {
    setFocusId(id);
    setView("photo");
  };

  async function save() {
    if (!draft || !session) return;
    setSaving(true);
    setSaveError(null);
    const pages = session.pages
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => isAccepted(p))
      .map(({ p, i }) => ({ key: p.id, pageIndex: i, model: p.result!.model, extraction: p.result!.extraction }));
    try {
      const res = await fetch(`/api/trees/${treeId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toImportPayload(draft, pages, session.importId ?? makeImportId())),
      });
      const data = (await res.json().catch(() => ({}))) as { people?: number; linked?: number; error?: string };
      if (!res.ok) {
        setSaveError(
          t("saveError", {
            reason: data.error === "invalid_relationships" ? t("saveErrorRelationships") : t("saveErrorGeneric"),
          }),
        );
        setSaving(false);
        return;
      }
      // Saved: the photos and the draft leave this device now.
      await clearSession(treeId);
      router.push(`/trees/${treeId}?imported=${(data.people ?? 0) + (data.linked ?? 0)}`);
    } catch {
      setSaveError(t("saveError", { reason: t("saveErrorGeneric") }));
      setSaving(false);
    }
  }

  if (!session) return null;
  if (!draft) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-ink-muted">{t("nothing")}</p>
        <Link href={`/trees/${treeId}/upload`} className={buttonClass("secondary", "self-start")}>
          {t("addPages")}
        </Link>
      </div>
    );
  }

  const nameOf = (id: string) => draft.people.find((p) => p.id === id)?.fullName || t("newPersonName");
  const saveCount = draft.people.length;

  return (
    <div className="flex flex-col gap-10">
      <p className="-mt-4">
        <Link href={`/trees/${treeId}/upload`}>← {t("backToPages")}</Link>
      </p>
      {rebuilt && <Notice>{t("rebuilt")}</Notice>}

      {/* On phones: switch between the data and the photo. Side by side from lg up. */}
      <div className="sticky top-0 z-10 -mx-5 border-b border-rule bg-paper px-5 py-2 sm:-mx-8 sm:px-8 lg:hidden">
        <div role="group" aria-label={t("viewLabel")} className="inline-flex overflow-hidden rounded-full border-3 border-ink shadow-neo-sm">
          {(["details", "photo"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`min-h-11 min-w-28 cursor-pointer px-4 font-semibold ${view === v ? "bg-accent text-paper" : "text-accent hover:bg-accent-tint"}`}
            >
              {v === "details" ? t("viewDetails") : t("viewPhoto")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className={`${view === "photo" ? "block" : "hidden"} lg:sticky lg:top-6 lg:block`}>
          <PhotoPanel key={focusId ?? "none"} pages={session.pages} draft={draft} focusId={focusId} />
        </div>

        <div className={`${view === "details" ? "flex" : "hidden"} flex-col gap-16 lg:flex`}>
          <Attention
            draft={draft}
            apply={apply}
            existingPeople={existingPeople}
            issues={issues}
            toCheck={toCheck}
            nameOf={nameOf}
          />
          <PeopleList
            draft={draft}
            apply={apply}
            existingPeople={existingPeople}
            onShowOnPhoto={showOnPhoto}
            focusId={focusId}
          />
          <Connections draft={draft} apply={apply} nameOf={nameOf} />
          <OutlineView draft={draft} nameOf={nameOf} />
          {draft.unclear.length > 0 && (
            <section aria-labelledby="notes-h" className="flex flex-col gap-4">
              <h2 id="notes-h">{t("notesFromReading")}</h2>
              <ul className="measure flex flex-col border-t border-rule">
                {draft.unclear.map((u, i) => (
                  <li key={i} className="border-b border-rule py-3">
                    <span className="text-ink-muted">{t("pageShort", { n: u.page + 1 })}</span> {u.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-rule bg-paper px-5 py-3 sm:-mx-8 sm:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="text-sm leading-snug text-ink-muted" aria-live="polite">
            {saveError ? (
              <span role="alert" className="font-semibold text-danger">
                {saveError}
              </span>
            ) : issues.length ? (
              <span className="font-semibold text-notice-ink">{t("saveBlocked")}</span>
            ) : (
              <span className="hidden sm:inline">{t("savedLocal")}</span>
            )}
          </p>
          <Button type="button" onClick={() => void save()} disabled={saving || issues.length > 0} className="w-full sm:w-auto">
            {saving ? t("saving") : t("save", { count: saveCount, tree: treeName })}
          </Button>
        </div>
      </div>
    </div>
  );
}
