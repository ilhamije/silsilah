"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  addPerson,
  confirmPerson,
  fieldNeedsCheck,
  linkExisting,
  mergePeople,
  newDraftPerson,
  personNeedsCheck,
  removePerson,
  updatePerson,
  type DraftPerson,
  type ExistingPerson,
  type ReviewDraft,
  type ReviewField,
} from "@/lib/review/draft";
import { Button, Input } from "@/components/ui";
import type { ApplyDraft } from "./review-workspace";

type Props = {
  draft: ReviewDraft;
  apply: ApplyDraft;
  existingPeople: ExistingPerson[];
  onShowOnPhoto: (id: string) => void;
  focusId: string | null;
};

const newId = () => `m${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

export function PeopleList({ draft, apply, existingPeople, onShowOnPhoto, focusId }: Props) {
  const t = useTranslations("review");
  const [openId, setOpenId] = useState<string | null>(null);

  function add() {
    const id = newId();
    apply((d) => addPerson(d, newDraftPerson(id)));
    setOpenId(id);
  }

  return (
    <section aria-labelledby="people-h" className="flex flex-col gap-4">
      <h2 id="people-h">
        {t("people")} <span className="text-ink-muted">({draft.people.length})</span>
      </h2>
      <ul className="flex flex-col border-t border-rule">
        {draft.people.map((p) => (
          <PersonItem
            key={p.id}
            person={p}
            draft={draft}
            apply={apply}
            existingPeople={existingPeople}
            open={openId === p.id}
            focused={focusId === p.id}
            onToggle={() => setOpenId(openId === p.id ? null : p.id)}
            onShowOnPhoto={() => onShowOnPhoto(p.id)}
          />
        ))}
      </ul>
      <Button type="button" variant="secondary" className="self-start" onClick={add}>
        + {t("addPerson")}
      </Button>
    </section>
  );
}

type ItemProps = {
  person: DraftPerson;
  draft: ReviewDraft;
  apply: ApplyDraft;
  existingPeople: ExistingPerson[];
  open: boolean;
  focused: boolean;
  onToggle: () => void;
  onShowOnPhoto: () => void;
};

function PersonItem({ person: p, draft, apply, existingPeople, open, focused, onToggle, onShowOnPhoto }: ItemProps) {
  const t = useTranslations("review");
  const flagged = personNeedsCheck(p);
  const editorId = `edit-${p.id}`;
  const nameInput = useRef<HTMLInputElement>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const linkedTo = p.existingId ? existingPeople.find((e) => e.id === p.existingId) : null;
  const details = [p.birthDate, p.deathDate && `† ${p.deathDate}`, p.birthPlace].filter(Boolean).join(" · ");

  useEffect(() => {
    if (open && !p.fullName) nameInput.current?.focus();
    // Only when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (patch: Parameters<typeof updatePerson>[2]) => apply((d) => updatePerson(d, p.id, patch));

  function remove() {
    if (window.confirm(t("removePersonConfirm", { name: p.fullName || t("newPersonName") }))) {
      apply((d) => removePerson(d, p.id));
    }
  }

  function combine() {
    if (!mergeTarget) return;
    if (mergeTarget.startsWith("existing:")) {
      apply((d) => linkExisting(d, p.id, mergeTarget.slice("existing:".length)));
    } else {
      apply((d) => mergePeople(d, p.id, mergeTarget));
    }
    setMergeTarget("");
  }

  return (
    <li className={`border-b border-rule ${flagged ? "bg-notice" : ""} ${focused ? "outline outline-2 -outline-offset-2 outline-accent" : ""}`}>
      <div className="flex items-start justify-between gap-4 px-3 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-serif text-2xl break-words">{p.fullName || t("newPersonName")}</span>
          {details && <span className="text-sm text-ink-muted">{details}</span>}
          <span className="flex flex-wrap gap-x-3 text-sm">
            {flagged && (
              <span className="font-semibold text-notice-ink">{p.illegible ? t("hardToRead") : t("pleaseCheck")}</span>
            )}
            {linkedTo && <span className="font-semibold text-accent">{t("linked")}</span>}
          </span>
        </div>
        <Button type="button" variant="secondary" aria-expanded={open} aria-controls={editorId} onClick={onToggle} className="shrink-0 px-4">
          {open ? t("done") : t("edit")}
        </Button>
      </div>

      {open && (
        <div id={editorId} className="flex flex-col gap-6 border-t border-rule bg-paper px-3 pb-6 pt-5">
          {linkedTo && (
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {t("linked")}: <strong>{linkedTo.fullName}</strong>
              </span>
              <Button type="button" variant="quiet" onClick={() => apply((d) => linkExisting(d, p.id, null))}>
                {t("unlink")}
              </Button>
            </div>
          )}

          <TextField person={p} field="fullName" label={t("fullName")} hint={t("fullNameHint")} inputRef={nameInput} onChange={(v) => set({ fullName: v })} />
          <div className="grid gap-6 sm:grid-cols-2">
            <TextField person={p} field="givenName" label={t("givenName")} onChange={(v) => set({ givenName: v })} />
            <TextField person={p} field="familyName" label={t("familyName")} onChange={(v) => set({ familyName: v })} />
          </div>
          <FieldShell id={`${p.id}-nick`} label={t("nicknames")} hint={t("nicknamesHint")}>
            <Input
              id={`${p.id}-nick`}
              defaultValue={p.nicknames.join(", ")}
              onBlur={(e) => set({ nicknames: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          </FieldShell>

          <fieldset className={`flex flex-col gap-2 ${fieldNeedsCheck(p, "gender") ? "bg-notice p-3" : ""}`}>
            <legend className="mb-2 font-semibold">
              {t("gender")}
              {fieldNeedsCheck(p, "gender") && <CheckTag />}
            </legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(["MALE", "FEMALE", "UNKNOWN"] as const).map((g) => (
                <label key={g} className="flex min-h-11 cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name={`${p.id}-gender`}
                    checked={p.gender === g}
                    onChange={() => set({ gender: g })}
                    className="h-5 w-5 accent-[var(--accent)]"
                  />
                  {t(g === "MALE" ? "male" : g === "FEMALE" ? "female" : "unknown")}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-6 sm:grid-cols-2">
            <TextField person={p} field="birthDate" label={t("birthDate")} hint={t("dateHint")} onChange={(v) => set({ birthDate: v })} />
            <TextField person={p} field="deathDate" label={t("deathDate")} onChange={(v) => set({ deathDate: v })} />
          </div>
          <TextField person={p} field="birthPlace" label={t("birthPlace")} onChange={(v) => set({ birthPlace: v })} />

          <FieldShell id={`${p.id}-notes`} label={t("notes")}>
            <textarea
              id={`${p.id}-notes`}
              value={p.notes}
              rows={3}
              onChange={(e) => set({ notes: e.target.value })}
              className="w-full rounded-[4px] border border-rule-strong bg-mat px-4 py-3 text-base focus:border-accent"
            />
          </FieldShell>

          <FieldShell id={`${p.id}-living`} label={t("living")}>
            <select
              id={`${p.id}-living`}
              value={p.livingOverride === null ? "auto" : p.livingOverride ? "yes" : "no"}
              onChange={(e) => set({ livingOverride: e.target.value === "auto" ? null : e.target.value === "yes" })}
              className="min-h-13 w-full rounded-[4px] border border-rule-strong bg-mat px-3 text-base"
            >
              <option value="auto">{t("livingAuto")}</option>
              <option value="yes">{t("livingYes")}</option>
              <option value="no">{t("livingNo")}</option>
            </select>
          </FieldShell>

          <FieldShell id={`${p.id}-merge`} label={t("mergeWith")} hint={t("mergeHint")}>
            <div className="flex flex-wrap gap-3">
              <select
                id={`${p.id}-merge`}
                value={mergeTarget}
                onChange={(e) => setMergeTarget(e.target.value)}
                className="min-h-13 min-w-0 flex-1 rounded-[4px] border border-rule-strong bg-mat px-3 text-base"
              >
                <option value="">{t("mergeChoose")}</option>
                <optgroup label={t("draftGroup")}>
                  {draft.people
                    .filter((o) => o.id !== p.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {[o.fullName || t("newPersonName"), o.birthDate].filter(Boolean).join(", ")}
                      </option>
                    ))}
                </optgroup>
                {existingPeople.length > 0 && (
                  <optgroup label={t("existingGroup")}>
                    {existingPeople.map((e) => (
                      <option key={e.id} value={`existing:${e.id}`}>
                        {[e.fullName, e.birthDate].filter(Boolean).join(", ")}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <Button type="button" variant="secondary" onClick={combine} disabled={!mergeTarget}>
                {t("mergeApply")}
              </Button>
            </div>
          </FieldShell>

          <div className="flex flex-wrap gap-3 border-t border-rule pt-5">
            {flagged && (
              <Button type="button" onClick={() => apply((d) => confirmPerson(d, p.id))}>
                {t("looksRight")}
              </Button>
            )}
            {p.pages.length > 0 && (
              <Button type="button" variant="secondary" onClick={onShowOnPhoto}>
                {t("showOnPhoto")}
              </Button>
            )}
            <Button type="button" variant="quiet" onClick={remove} className="text-danger hover:text-danger">
              {t("removePerson")}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function CheckTag() {
  const t = useTranslations("review");
  return <span className="ml-2 text-sm font-semibold text-notice-ink">· {t("pleaseCheck")}</span>;
}

function FieldShell({ id, label, hint, flagged, children }: { id: string; label: string; hint?: string; flagged?: boolean; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-2 ${flagged ? "bg-notice p-3" : ""}`}>
      <label htmlFor={id} className="font-semibold">
        {label}
        {flagged && <CheckTag />}
      </label>
      {children}
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

/** A text field that turns amber while the AI's reading of it is uncertain. */
function TextField({
  person,
  field,
  label,
  hint,
  onChange,
  inputRef,
}: {
  person: DraftPerson;
  field: Exclude<ReviewField, "gender">;
  label: string;
  hint?: string;
  onChange: (v: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const id = `${person.id}-${field}`;
  const flagged = fieldNeedsCheck(person, field);
  return (
    <FieldShell id={id} label={label} hint={hint} flagged={flagged}>
      <Input
        id={id}
        ref={inputRef}
        value={person[field]}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={field === "fullName" && !person.fullName.trim() && !person.existingId ? true : undefined}
        className={flagged ? "border-notice-ink" : ""}
      />
    </FieldShell>
  );
}
