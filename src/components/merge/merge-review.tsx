"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Notice } from "@/components/ui";
import {
  acceptMergeAction,
  rejectMergeAction,
  respondConnectionAction,
  undoMergeAction,
} from "@/app/trees/[treeId]/merges/actions";
import type { PairView, PersonView, ReviewData } from "@/lib/merge/read";

type Field = ReviewData["fields"][number];
const key = (p: { aId: string; bId: string }) => `${p.aId}:${p.bId}`;

/** Side-by-side review: keep or drop each matched pair, and pick a winner where the two disagree. */
export function MergeReview({ treeId, data }: { treeId: string; data: ReviewData }) {
  const t = useTranslations("merge");
  const router = useRouter();
  const [keep, setKeep] = useState(() => new Set(data.pairs.map(key)));
  const [choices, setChoices] = useState<Record<string, Partial<Record<Field, "a" | "b">>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "notice"; text: string } | null>(null);

  const open = data.status === "PENDING" || data.status === "REVIEWING";
  const canDecide = data.treeA.canDecide && data.treeB.canDecide;
  const show = (v: string | null) => (v ? v : "—");

  async function go(fn: () => Promise<{ ok: true; note?: string } | { ok: false; error: string }>, okText?: string) {
    setBusy(true);
    setMessage(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return setMessage({ tone: "notice", text: t.has(`error.${res.error}`) ? t(`error.${res.error}`) : t("error.generic") });
    if (okText) setMessage({ tone: "info", text: okText });
    router.refresh();
  }

  const conflicts = (p: PairView): Field[] =>
    p.a && p.b ? data.fields.filter((f) => (p.a![f as keyof PersonView] ?? "") !== (p.b![f as keyof PersonView] ?? "")) : [];

  const accept = () => {
    const kept = data.pairs.filter((p) => keep.has(key(p)));
    const picks = Object.fromEntries(kept.map((p) => [key(p), choices[key(p)] ?? {}]).filter(([, c]) => Object.keys(c as object).length));
    return go(() => acceptMergeAction(data.id, { keep: kept.map(key), choices: picks }), t("accepted"));
  };

  return (
    <div className="flex flex-col gap-8">
      {message && <Notice tone={message.tone} role="status">{message.text}</Notice>}

      {data.pendingRequestId && (
        <div className="neo-card flex flex-col gap-4 p-5">
          <p>{t("requestPrompt")}</p>
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={() => go(() => respondConnectionAction(data.pendingRequestId!, true))}>
              {t("allow")}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => go(() => respondConnectionAction(data.pendingRequestId!, false))}>
              {t("decline")}
            </Button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-6">
        {data.pairs.map((p) => {
          const k = key(p);
          const diff = conflicts(p);
          return (
            <li key={k} className="neo-card flex flex-col gap-4 p-5">
              <label className="flex items-center gap-3 font-bold">
                <input
                  type="checkbox"
                  className="size-5"
                  disabled={!open || !canDecide && !data.crossFamily}
                  checked={keep.has(k)}
                  onChange={(e) => {
                    const next = new Set(keep);
                    if (e.target.checked) next.add(k);
                    else next.delete(k);
                    setKeep(next);
                  }}
                />
                {p.a?.fullName ?? "—"} <span aria-hidden>↔</span> {p.b?.fullName ?? "—"}
              </label>
              <p className="text-sm text-ink-muted">{p.kinds.map((x) => t(`kind.${x}`)).join(" · ")}</p>
              {diff.length > 0 && open && !data.crossFamily && (
                <fieldset className="flex flex-col gap-3">
                  <legend className="font-semibold">{t("conflicts")}</legend>
                  {diff.map((f) => (
                    <div key={f} className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr] sm:items-center">
                      <span className="text-sm text-ink-muted">{t(`field.${f}`)}</span>
                      {(["a", "b"] as const).map((side) => (
                        <label key={side} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`${k}-${f}`}
                            checked={choices[k]?.[f] === side}
                            onChange={() => setChoices({ ...choices, [k]: { ...choices[k], [f]: side } })}
                          />
                          {show((side === "a" ? p.a : p.b)![f as keyof PersonView] as string | null)}
                        </label>
                      ))}
                    </div>
                  ))}
                  <p className="text-sm text-ink-muted">{t("conflictHint")}</p>
                </fieldset>
              )}
            </li>
          );
        })}
      </ul>

      {open && data.hidden === "none" && data.pairs.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy || keep.size === 0 || (!canDecide && !data.crossFamily)} onClick={accept}>
            {t("accept", { count: keep.size })}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => go(() => rejectMergeAction(data.id), t("rejected"))}>
            {t("reject")}
          </Button>
        </div>
      )}
      {open && data.hidden === "requester" && (
        <Button variant="secondary" disabled={busy} onClick={() => go(() => rejectMergeAction(data.id), t("rejected"))}>
          {t("reject")}
        </Button>
      )}
      {data.operationId && (
        <div className="flex flex-col gap-2">
          <p>{t("alreadyAccepted")}</p>
          <div>
            <Button variant="secondary" disabled={busy} onClick={() => go(() => undoMergeAction(data.operationId!), t("undone"))}>
              {t("undo")}
            </Button>
          </div>
        </div>
      )}
      <p>
        <a href={`/trees/${treeId}`}>{t("backToTree")}</a>
      </p>
    </div>
  );
}
