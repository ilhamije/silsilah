"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { deleteTreeAction, leaveTreeAction } from "@/app/trees/[treeId]/settings/actions";
import { Button, Field, Input, Notice } from "@/components/ui";
import { settingsError } from "./errors";

export function DangerSection({ treeId, treeName, isOwner }: { treeId: string; treeName: string; isOwner: boolean }) {
  const t = useTranslations("settings");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string } | void>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    // On success the action redirects, so only failures come back.
    if (res && !res.ok) setError(settingsError(t, res.error ?? "generic"));
  }

  return (
    <section className="flex flex-col gap-6 border-t-4 border-ink pt-8">
      <h2>{t("danger")}</h2>
      {error && <Notice tone="notice" role="alert">{error}</Notice>}
      <div className="flex flex-col gap-3">
        <p className="measure text-ink-muted">{t("leaveHint")}</p>
        <div>
          <Button variant="secondary" disabled={busy} onClick={() => confirm(t("leaveConfirm", { name: treeName })) && run(() => leaveTreeAction(treeId))}>
            {t("leave")}
          </Button>
        </div>
      </div>
      {isOwner && (
        <form
          className="neo-card flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => deleteTreeAction(treeId, typed));
          }}
        >
          <p className="measure">{t("deleteHint", { name: treeName })}</p>
          <Field id="delete-name" label={t("deleteType")}>
            <Input id="delete-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          <div>
            <Button type="submit" disabled={busy || typed.trim() !== treeName.trim()}>{t("delete")}</Button>
          </div>
        </form>
      )}
    </section>
  );
}
