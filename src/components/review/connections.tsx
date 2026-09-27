"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  addRelationship,
  confirmRelationship,
  relationshipNeedsCheck,
  removeRelationship,
  swapRelationship,
  type ReviewDraft,
} from "@/lib/review/draft";
import { Button } from "@/components/ui";
import type { ApplyDraft } from "./review-workspace";

type Props = { draft: ReviewDraft; apply: ApplyDraft; nameOf: (id: string) => string };

const selectClass = "min-h-13 w-full rounded-field border-3 border-rule-strong bg-mat shadow-neo-sm px-3 text-base";
const newId = () => `rm${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

export function Connections({ draft, apply, nameOf }: Props) {
  const t = useTranslations("review");
  const [a, setA] = useState("");
  const [rel, setRel] = useState<"parentOf" | "childOf" | "spouseOf">("parentOf");
  const [b, setB] = useState("");

  function add() {
    if (!a || !b || a === b) return;
    const id = newId();
    apply((d) =>
      addRelationship(
        d,
        rel === "spouseOf"
          ? { id, type: "SPOUSE", from: a, to: b }
          : rel === "parentOf"
            ? { id, type: "PARENT_CHILD", from: a, to: b }
            : { id, type: "PARENT_CHILD", from: b, to: a },
      ),
    );
    setB("");
  }

  const options = draft.people.map((p) => (
    <option key={p.id} value={p.id}>
      {[nameOf(p.id), p.birthDate].filter(Boolean).join(", ")}
    </option>
  ));

  return (
    <section aria-labelledby="links-h" className="flex flex-col gap-4">
      <h2 id="links-h">
        {t("connections")} <span className="text-ink-muted">({draft.relationships.length})</span>
      </h2>
      <ul className="flex flex-col border-t border-rule">
        {draft.relationships.map((r) => {
          const flagged = relationshipNeedsCheck(r);
          return (
            <li key={r.id} className={`flex flex-col gap-2 border-b border-rule px-3 py-4 sm:flex-row sm:items-center sm:justify-between ${flagged ? "border-l-[8px] border-l-orange bg-notice" : ""}`}>
              <span>
                {r.type === "PARENT_CHILD"
                  ? t("parentOf", { parent: nameOf(r.from), child: nameOf(r.to) })
                  : t("spouseOf", { a: nameOf(r.from), b: nameOf(r.to) })}
                {flagged && <span className="ml-2 text-sm font-semibold text-notice-ink">· {t("pleaseCheck")}</span>}
              </span>
              <span className="flex flex-wrap gap-x-1">
                {flagged && (
                  <Button type="button" variant="quiet" onClick={() => apply((d) => confirmRelationship(d, r.id))}>
                    {t("looksRight")}
                  </Button>
                )}
                {r.type === "PARENT_CHILD" && (
                  <Button type="button" variant="quiet" onClick={() => apply((d) => swapRelationship(d, r.id))}>
                    {t("swap")}
                  </Button>
                )}
                <Button type="button" variant="quiet" onClick={() => apply((d) => removeRelationship(d, r.id))}>
                  {t("remove")}
                </Button>
              </span>
            </li>
          );
        })}
      </ul>

      <fieldset className="mt-4 flex flex-col gap-4 rounded-card border-3 border-ink p-4 sm:p-6">
        <legend className="px-2 font-display text-2xl">{t("addConnection")}</legend>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="add-link-personA" className="font-semibold">
              {t("personA")}
            </label>
            <select id="add-link-personA" value={a} onChange={(e) => setA(e.target.value)} className={selectClass}>
              <option value="" />
              {options}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="add-link-relation" className="font-semibold">
              {t("relation")}
            </label>
            <select id="add-link-relation" value={rel} onChange={(e) => setRel(e.target.value as typeof rel)} className={selectClass}>
              <option value="parentOf">{t("relParentOf")}</option>
              <option value="childOf">{t("relChildOf")}</option>
              <option value="spouseOf">{t("relSpouseOf")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="add-link-personB" className="font-semibold">
              {t("personB")}
            </label>
            <select id="add-link-personB" value={b} onChange={(e) => setB(e.target.value)} className={selectClass}>
              <option value="" />
              {options}
            </select>
          </div>
        </div>
        <Button type="button" variant="secondary" className="self-start" onClick={add} disabled={!a || !b || a === b}>
          {t("add")}
        </Button>
      </fieldset>
    </section>
  );
}
