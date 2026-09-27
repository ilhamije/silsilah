"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  addRelativeAction,
  connectAction,
  deletePersonAction,
  disconnectAction,
  type ActionResult,
} from "@/app/trees/[treeId]/actions";
import { Button, Field, Input, Notice } from "@/components/ui";
import { EditDetails, ViewDetails } from "./person-details";
import { errorMessage, type TreePerson, type TreeRelationship } from "./types";

type Props = {
  treeId: string;
  person: TreePerson;
  people: TreePerson[];
  relationships: TreeRelationship[];
  canEdit: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Called after a successful change; the id (or null) says who to show next. */
  onDone: (showId?: string | null) => void;
};

const control = "min-h-13 w-full rounded-field border-3 border-rule-strong bg-mat shadow-neo-sm px-3 text-base";

/**
 * Everything about one person on the saved tree, in the order people use it:
 * add a relative, see their family, edit details (optimistic locking), and
 * connect someone already in the tree.
 */
export function PersonPanel({ treeId, person: p, people, relationships, canEdit, onSelect, onClose, onDone }: Props) {
  const t = useTranslations("tree");
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const nameOf = (id: string) => people.find((x) => x.id === id)?.fullName ?? "?";
  const mine = relationships.filter((r) => r.personAId === p.id || r.personBId === p.id);
  const parents = mine.filter((r) => r.type === "PARENT_CHILD" && r.personBId === p.id);
  const children = mine.filter((r) => r.type === "PARENT_CHILD" && r.personAId === p.id);
  const spouses = mine.filter((r) => r.type === "SPOUSE");
  const other = (r: TreeRelationship) => (r.personAId === p.id ? r.personBId : r.personAId);
  const spouseIds = spouses.map(other);
  // A spouse's children who aren't this person's own children.
  const ownChildren = new Set(children.map((r) => r.personBId));
  const stepChildren = [
    ...new Set(
      relationships
        .filter((r) => r.type === "PARENT_CHILD" && spouseIds.includes(r.personAId) && !ownChildren.has(r.personBId) && r.personBId !== p.id)
        .map((r) => r.personBId),
    ),
  ];

  /** Runs an action; on success hands over to onDone, on failure shows the reason here. */
  async function act(call: () => Promise<ActionResult>, showId?: (res: ActionResult & { ok: true }) => string | null) {
    setBusy(true);
    setError(null);
    const res = await call();
    setBusy(false);
    if (!res.ok) {
      setError({ text: errorMessage(t, res.error), conflict: !!res.conflict });
      return false;
    }
    onDone(showId ? showId(res) : undefined);
    return true;
  }

  return (
    <section aria-labelledby="person-h" className="neo-card flex flex-col gap-8 p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 id="person-h" className="break-words">
          {p.fullName}
        </h2>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("close")}
        </Button>
      </div>

      {error && (
        <Notice tone="notice" role="alert">
          <div className="flex flex-col items-start gap-3">
            <span>{error.text}</span>
            {error.conflict && (
              <Button type="button" variant="secondary" onClick={() => onDone()}>
                {t("reload")}
              </Button>
            )}
          </div>
        </Notice>
      )}

      {canEdit && <AddRelative treeId={treeId} person={p} spouses={spouseIds.map((id) => ({ id, name: nameOf(id) }))} busy={busy} act={act} />}

      <section aria-labelledby="family-h" className="flex flex-col gap-5">
        <h3 id="family-h">{t("family")}</h3>
        {(
          [
            ["parents", parents],
            ["children", children],
            ["spouses", spouses],
          ] as const
        ).map(([key, rels]) => (
          <div key={key} className="flex flex-col gap-2">
            <p className="font-semibold">{t(key)}</p>
            {rels.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noneYet")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {rels.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <button type="button" onClick={() => onSelect(other(r))} className="cursor-pointer text-left font-semibold underline decoration-2 underline-offset-4">
                      {nameOf(other(r))}
                    </button>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={busy}
                        className="min-h-11 text-sm text-danger hover:text-danger"
                        onClick={() => {
                          if (!confirm(t("removeConnectionConfirm", { a: p.fullName, b: nameOf(other(r)) }))) return;
                          void act(() => disconnectAction(treeId, r.id, r.version));
                        }}
                      >
                        {t("removeConnection")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {stepChildren.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="font-semibold">{t("stepChildren")}</p>
            <ul className="flex flex-col gap-2">
              {stepChildren.map((id) => (
                <li key={id} className="flex min-h-11 items-center">
                  <button type="button" onClick={() => onSelect(id)} className="cursor-pointer text-left font-semibold underline decoration-2 underline-offset-4">
                    {nameOf(id)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="details-h" className="flex flex-col gap-5 border-t-3 border-ink pt-6">
        <h3 id="details-h">{t("details")}</h3>
        {canEdit ? <EditDetails treeId={treeId} person={p} onSaved={() => onDone()} /> : <ViewDetails person={p} treeId={treeId} />}
      </section>

      {canEdit && (
        <>
          <ConnectExisting treeId={treeId} person={p} people={people} busy={busy} act={act} />
          <div className="border-t-3 border-ink pt-5">
            <Button
              type="button"
              variant="quiet"
              disabled={busy}
              className="text-danger hover:text-danger"
              onClick={() => {
                if (!confirm(t("removePersonConfirm", { name: p.fullName }))) return;
                void act(() => deletePersonAction(treeId, p.id, p.version), () => null);
              }}
            >
              {t("removePerson")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

type Act = (call: () => Promise<ActionResult>, showId?: (res: ActionResult & { ok: true }) => string | null) => Promise<boolean>;

function AddRelative({
  treeId,
  person: p,
  spouses,
  busy,
  act,
}: {
  treeId: string;
  person: TreePerson;
  spouses: { id: string; name: string }[];
  busy: boolean;
  act: Act;
}) {
  const t = useTranslations("tree");
  const [kind, setKind] = useState<"parent" | "child" | "spouse" | null>(null);
  const [name, setName] = useState("");
  // A new child is the couple's by default; "" means the other parent isn't known (a step-child of the spouse).
  const [otherParent, setOtherParent] = useState(spouses.length === 1 ? spouses[0].id : "");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!kind) return;
    const ok = await act(
      () => addRelativeAction(treeId, p.id, kind, { fullName: name }, kind === "child" ? otherParent || null : null),
      (res) => res.id ?? null,
    );
    if (ok) {
      setName("");
      setKind(null);
    }
  }

  return (
    <section aria-labelledby="add-rel-h" className="flex flex-col gap-4">
      <h3 id="add-rel-h">{t("addRelative", { name: p.fullName })}</h3>
      <div className="flex flex-wrap gap-3">
        {(["parent", "child", "spouse"] as const).map((k) => (
          <Button key={k} type="button" variant={kind === k ? "primary" : "secondary"} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
            {t(`add_${k}`)}
          </Button>
        ))}
      </div>
      {kind && (
        <form onSubmit={add} className="flex flex-col gap-4">
          <Field id="relative-name" label={t(`name_${kind}`)} hint={t("relativeHint")}>
            <Input id="relative-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} autoFocus />
          </Field>
          {kind === "child" && spouses.length > 0 && (
            <Field id="relative-other-parent" label={t("otherParent")} hint={t("otherParentHint")}>
              <select id="relative-other-parent" value={otherParent} onChange={(e) => setOtherParent(e.target.value)} className={control}>
                {spouses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="">{t("otherParentUnknown")}</option>
              </select>
            </Field>
          )}
          <Button type="submit" disabled={busy || !name.trim()} className="self-start">
            {t("add")}
          </Button>
        </form>
      )}
    </section>
  );
}

function ConnectExisting({
  treeId,
  person: p,
  people,
  busy,
  act,
}: {
  treeId: string;
  person: TreePerson;
  people: TreePerson[];
  busy: boolean;
  act: Act;
}) {
  const t = useTranslations("tree");
  const [relation, setRelation] = useState<"parentOf" | "childOf" | "spouseOf">("parentOf");
  const [otherId, setOtherId] = useState("");
  const others = people.filter((x) => x.id !== p.id);
  if (!others.length) return null;

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!otherId) return;
    const input =
      relation === "spouseOf"
        ? { type: "SPOUSE", fromPersonId: p.id, toPersonId: otherId }
        : relation === "parentOf"
          ? { type: "PARENT_CHILD", fromPersonId: p.id, toPersonId: otherId }
          : { type: "PARENT_CHILD", fromPersonId: otherId, toPersonId: p.id };
    if (await act(() => connectAction(treeId, input))) setOtherId("");
  }

  return (
    <section aria-labelledby="connect-h" className="flex flex-col gap-4">
      <h3 id="connect-h">{t("connectExisting")}</h3>
      <form onSubmit={connect} className="flex flex-col gap-4">
        <Field id="connect-relation" label={t("connectIs", { name: p.fullName })}>
          <select id="connect-relation" value={relation} onChange={(e) => setRelation(e.target.value as typeof relation)} className={control}>
            <option value="parentOf">{t("relParentOf")}</option>
            <option value="childOf">{t("relChildOf")}</option>
            <option value="spouseOf">{t("relSpouseOf")}</option>
          </select>
        </Field>
        <Field id="connect-other" label={t("connectWho")}>
          <select id="connect-other" value={otherId} onChange={(e) => setOtherId(e.target.value)} className={control} required>
            <option value="">{t("choosePerson")}</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {[o.fullName, o.birthYear].filter(Boolean).join(", ")}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" variant="secondary" disabled={busy || !otherId} className="self-start">
          {t("connect")}
        </Button>
      </form>
    </section>
  );
}
