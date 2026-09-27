"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { savePersonAction, suggestEditAction, type ConflictPerson } from "@/app/trees/[treeId]/actions";
import { Button, Field, Input, Notice } from "@/components/ui";
import { errorMessage, type TreePerson } from "./types";

/*
 * A person's details on the saved tree. Editors save them directly (with
 * optimistic locking and a field-by-field choice when someone else saved
 * first); everyone else can suggest a change for an editor to approve.
 */

const control = "min-h-13 w-full rounded-field border-3 border-rule-strong bg-mat shadow-neo-sm px-3 text-base";

const KEYS = ["fullName", "gender", "birthDate", "deathDate", "birthPlace", "notes", "living"] as const;
type Key = (typeof KEYS)[number];
type Values = {
  fullName: string;
  gender: TreePerson["gender"];
  birthDate: string;
  deathDate: string;
  birthPlace: string;
  notes: string;
  living: "auto" | "yes" | "no";
};

type Source = Pick<TreePerson, "fullName" | "gender" | "birthDate" | "deathDate" | "birthPlace" | "notes" | "isLiving" | "livingIsManual">;

function valuesOf(p: Source): Values {
  return {
    fullName: p.fullName,
    gender: p.gender,
    birthDate: p.birthDate ?? "",
    deathDate: p.deathDate ?? "",
    birthPlace: p.birthPlace ?? "",
    notes: p.notes ?? "",
    living: p.livingIsManual ? (p.isLiving ? "yes" : "no") : "auto",
  };
}

/** Values as the person services expect them; `only` limits it to some fields. */
function toFields(v: Values, only?: Key[]) {
  const all: Record<Key, unknown> = { ...v, living: undefined };
  const out: Record<string, unknown> = {};
  for (const k of only ?? KEYS) {
    if (k === "living") out.livingOverride = v.living === "auto" ? null : v.living === "yes";
    else out[k] = all[k];
  }
  return out;
}

/** The form fields shared by editing and suggesting. */
function DetailsFields({ v, set }: { v: Values; set: (patch: Partial<Values>) => void }) {
  const r = useTranslations("review");
  const id = (k: string) => `person-${k}`;
  return (
    <>
      <Field id={id("name")} label={r("fullName")} hint={r("fullNameHint")}>
        <Input id={id("name")} value={v.fullName} onChange={(e) => set({ fullName: e.target.value })} required maxLength={200} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">{r("gender")}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(["MALE", "FEMALE", "UNKNOWN"] as const).map((g) => (
            <label key={g} className="flex min-h-11 cursor-pointer items-center gap-2">
              <input type="radio" name={id("gender")} checked={v.gender === g} onChange={() => set({ gender: g })} className="h-5 w-5 accent-ink" />
              {r(g === "MALE" ? "male" : g === "FEMALE" ? "female" : "unknown")}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id={id("born")} label={r("birthDate")} hint={r("dateHint")}>
          <Input id={id("born")} value={v.birthDate} onChange={(e) => set({ birthDate: e.target.value })} maxLength={60} />
        </Field>
        <Field id={id("died")} label={r("deathDate")}>
          <Input id={id("died")} value={v.deathDate} onChange={(e) => set({ deathDate: e.target.value })} maxLength={60} />
        </Field>
      </div>
      <Field id={id("place")} label={r("birthPlace")}>
        <Input id={id("place")} value={v.birthPlace} onChange={(e) => set({ birthPlace: e.target.value })} maxLength={200} />
      </Field>
      <Field id={id("notes")} label={r("notes")}>
        <textarea id={id("notes")} value={v.notes} rows={3} maxLength={4000} onChange={(e) => set({ notes: e.target.value })} className={`${control} py-3`} />
      </Field>
      <Field id={id("living")} label={r("living")}>
        <select id={id("living")} value={v.living} onChange={(e) => set({ living: e.target.value as Values["living"] })} className={control}>
          <option value="auto">{r("livingAuto")}</option>
          <option value="yes">{r("livingYes")}</option>
          <option value="no">{r("livingNo")}</option>
        </select>
      </Field>
    </>
  );
}

function useLabels() {
  const r = useTranslations("review");
  const label: Record<Key, string> = {
    fullName: r("fullName"),
    gender: r("gender"),
    birthDate: r("birthDate"),
    deathDate: r("deathDate"),
    birthPlace: r("birthPlace"),
    notes: r("notes"),
    living: r("living"),
  };
  const show = (k: Key, v: Values) =>
    k === "gender"
      ? r(v.gender === "MALE" ? "male" : v.gender === "FEMALE" ? "female" : "unknown")
      : k === "living"
        ? r(v.living === "auto" ? "livingAuto" : v.living === "yes" ? "livingYes" : "livingNo")
        : v[k] || "—";
  return { label, show };
}

type Conflict = { current: ConflictPerson; theirs: Values; choice: Partial<Record<Key, "mine" | "theirs">> };

export function EditDetails({ treeId, person: p, onSaved }: { treeId: string; person: TreePerson; onSaved: () => void }) {
  const t = useTranslations("tree");
  const { label, show } = useLabels();
  const original = valuesOf(p);
  const [v, setV] = useState(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const set = (patch: Partial<Values>) => setV((cur) => ({ ...cur, ...patch }));

  async function send(values: Values, version: number) {
    setBusy(true);
    setError(null);
    const res = await savePersonAction(treeId, p.id, version, toFields(values));
    setBusy(false);
    if (res.ok) return onSaved();
    if ("current" in res) {
      // Someone else saved first. Their changes win where we didn't touch a
      // field; where we both did, the user chooses (defaulting to their own edit).
      const theirs = valuesOf(res.current);
      const choice: Conflict["choice"] = {};
      for (const k of KEYS) {
        if (theirs[k] !== original[k] && values[k] !== theirs[k]) choice[k] = values[k] !== original[k] ? "mine" : "theirs";
      }
      setConflict({ current: res.current, theirs, choice });
      return;
    }
    setError(errorMessage(t, res.error));
  }

  function resolve() {
    if (!conflict) return;
    const merged = { ...conflict.theirs } as Values;
    for (const k of KEYS) {
      const pick = conflict.choice[k] ?? (v[k] !== original[k] ? "mine" : "theirs");
      if (pick === "mine") (merged as Record<Key, unknown>)[k] = v[k];
    }
    setConflict(null);
    void send(merged, conflict.current.version);
  }

  if (conflict) {
    const keys = Object.keys(conflict.choice) as Key[];
    return (
      <div className="flex flex-col gap-6">
        <Notice tone="notice" role="alert">
          {t("conflictIntro")}
        </Notice>
        {keys.length === 0 && <p>{t("conflictNothing")}</p>}
        {keys.map((k) => (
          <fieldset key={k} className="flex flex-col gap-2 rounded-field border-3 border-ink p-4">
            <legend className="px-2 font-semibold">{label[k]}</legend>
            {(["mine", "theirs"] as const).map((side) => (
              <label key={side} className="flex min-h-11 cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name={`conflict-${k}`}
                  checked={conflict.choice[k] === side}
                  onChange={() => setConflict({ ...conflict, choice: { ...conflict.choice, [k]: side } })}
                  className="mt-1 h-5 w-5 shrink-0 accent-ink"
                />
                <span>
                  <span className="font-semibold">{side === "mine" ? t("keepMine") : t("keepTheirs")}</span>
                  <span className="block whitespace-pre-line text-ink-muted">{show(k, side === "mine" ? v : conflict.theirs)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={resolve} disabled={busy}>
            {t("conflictSave")}
          </Button>
          <Button type="button" variant="quiet" onClick={onSaved}>
            {t("conflictDiscard")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send(v, p.version);
      }}
      className="flex flex-col gap-6"
    >
      <DetailsFields v={v} set={set} />
      {error && (
        <Notice tone="notice" role="alert">
          {error}
        </Notice>
      )}
      <Button type="submit" disabled={busy || !v.fullName.trim()} className="self-start">
        {busy ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

export function ViewDetails({ person: p, treeId }: { person: TreePerson; treeId: string }) {
  const t = useTranslations("tree");
  const r = useTranslations("review");
  const [suggesting, setSuggesting] = useState(false);
  const [sent, setSent] = useState(false);

  const rows = p.redacted
    ? []
    : [
        [r("birthDate"), p.birthDate],
        [r("deathDate"), p.deathDate ?? (p.isLiving === false ? t("deceased") : null)],
        [r("birthPlace"), p.birthPlace],
        [r("notes"), p.notes],
      ].filter(([, v]) => v);

  return (
    <div className="flex flex-col gap-5">
      {p.redacted ? (
        <p className="text-ink-muted">{t("hidden")}</p>
      ) : rows.length === 0 ? (
        <p className="text-ink-muted">{t("noDetails")}</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold">{k}</dt>
              <dd className="whitespace-pre-line text-ink-muted">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {sent && <Notice role="status">{t("suggestSent")}</Notice>}
      {suggesting ? (
        <SuggestChange
          treeId={treeId}
          person={p}
          onDone={(ok) => {
            setSuggesting(false);
            setSent(ok);
          }}
        />
      ) : (
        <Button type="button" variant="secondary" className="self-start" onClick={() => setSuggesting(true)}>
          {t("suggest")}
        </Button>
      )}
    </div>
  );
}

function SuggestChange({ treeId, person: p, onDone }: { treeId: string; person: TreePerson; onDone: (sent: boolean) => void }) {
  const t = useTranslations("tree");
  const original = valuesOf(p);
  const [v, setV] = useState(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const changed = KEYS.filter((k) => v[k] !== original[k]);
    if (!changed.length) return setError(t("suggestNothing"));
    setBusy(true);
    setError(null);
    const res = await suggestEditAction(treeId, p.id, toFields(v, changed));
    setBusy(false);
    if (!res.ok) return setError(errorMessage(t, res.error));
    onDone(true);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 rounded-card border-3 border-ink p-4 sm:p-6">
      <p className="measure text-sm text-ink-muted">{t("suggestHint")}</p>
      <DetailsFields v={v} set={(patch) => setV((cur) => ({ ...cur, ...patch }))} />
      {error && (
        <Notice tone="notice" role="alert">
          {error}
        </Notice>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy || !v.fullName.trim()}>
          {t("suggestSend")}
        </Button>
        <Button type="button" variant="quiet" onClick={() => onDone(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
