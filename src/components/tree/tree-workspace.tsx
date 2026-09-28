"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addPersonAction } from "@/app/trees/[treeId]/actions";
import { Button, Field, Input, Notice } from "@/components/ui";
import { FamilyChart } from "./family-chart";
import { PersonPanel } from "./person-panel";
import { errorMessage, type TreePerson, type TreeRelationship } from "./types";

type Props = {
  treeId: string;
  people: TreePerson[];
  relationships: TreeRelationship[];
  canEdit: boolean;
  /** The viewer's own person ("This is me"). */
  selfId: string | null;
};

/** The saved tree: the chart, plus a panel for whoever is tapped. */
export function TreeWorkspace({ treeId, people, relationships, canEdit, selfId }: Props) {
  const t = useTranslations("tree");
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [centerOn, setCenterOn] = useState<{ id: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const edges = useMemo(
    () => relationships.map((r) => ({ type: r.type, from: r.personAId, to: r.personBId })),
    [relationships],
  );
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  useEffect(() => {
    if (selectedId) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  /** After any change: reload the server data, and optionally show someone. */
  const done = (showId?: string | null) => {
    router.refresh();
    if (showId !== undefined) setSelectedId(showId);
  };

  return (
    <div className="flex flex-col gap-10">
      {people.length > 0 && (
        <section aria-labelledby="chart-h" className="flex flex-col gap-4">
          <h2 id="chart-h">{t("chartTitle")}</h2>
          <p className="measure text-sm text-ink-muted">{canEdit ? t("chartHintEditor") : t("chartHint")}</p>
          <FamilyChart
            people={people}
            relationships={edges}
            nameOf={(id) => byId.get(id)?.fullName ?? "?"}
            detailOf={(id) => lifeYears(byId.get(id))}
            onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
            selectedId={selectedId}
            selfId={selfId}
            centerOn={centerOn}
          />
        </section>
      )}

      {selected && (
        <div ref={panel} className="scroll-mt-6">
          <PersonPanel
            key={`${selected.id}:${selected.version}`}
            treeId={treeId}
            person={selected}
            people={people}
            relationships={relationships}
            canEdit={canEdit}
            isSelf={selected.id === selfId}
            onSelect={setSelectedId}
            onCenter={() => setCenterOn({ id: selected.id })}
            onClose={() => setSelectedId(null)}
            onDone={done}
          />
        </div>
      )}

      {canEdit ? (
        <AddPerson treeId={treeId} first={people.length === 0} onAdded={(id) => done(id)} />
      ) : (
        people.length === 0 && <p className="measure text-ink-muted">{t("noPeople")}</p>
      )}
    </div>
  );
}

/** "1921–1990", "1950–", "?–1970", or † when only known to be deceased. */
export function lifeYears(p: TreePerson | undefined): string | null {
  if (!p) return null;
  if (p.birthYear == null && p.deathYear == null) return p.isLiving === false ? "†" : null;
  return `${p.birthYear ?? "?"}–${p.deathYear ?? ""}`;
}

/** Someone not connected to anyone yet (or the very first person in an empty tree). */
function AddPerson({ treeId, first, onAdded }: { treeId: string; first: boolean; onAdded: (id: string) => void }) {
  const t = useTranslations("tree");
  const [open, setOpen] = useState(first);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await addPersonAction(treeId, { fullName: name });
    setBusy(false);
    if (!res.ok) return setError(errorMessage(t, res.error));
    setName("");
    setOpen(first ? true : false);
    onAdded(res.id!);
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" className="self-start" onClick={() => setOpen(true)}>
        {t("addPerson")}
      </Button>
    );
  }
  return (
    <section aria-labelledby="add-person-h" className="flex max-w-xl flex-col gap-4">
      <h2 id="add-person-h">{first ? t("addFirst") : t("addPerson")}</h2>
      <p className="measure text-sm text-ink-muted">{first ? t("addFirstHint") : t("addPersonHint")}</p>
      {error && (
        <Notice tone="notice" role="alert">
          {error}
        </Notice>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field id="new-person-name" label={t("fullName")}>
          <Input id="new-person-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy || !name.trim()}>
            {t("add")}
          </Button>
          {!first && (
            <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
