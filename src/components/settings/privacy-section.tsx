"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updatePrivacyAction } from "@/app/trees/[treeId]/settings/actions";
import { Notice } from "@/components/ui";
import { settingsError } from "./errors";

export function PrivacySection({ treeId, hideLiving, crossFamily }: { treeId: string; hideLiving: boolean; crossFamily: boolean }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function set(change: { hideLivingFromViewers?: boolean; allowCrossFamilyMatch?: boolean }) {
    setBusy(true);
    setError(null);
    const res = await updatePrivacyAction(treeId, change);
    setBusy(false);
    if (!res.ok) return setError(settingsError(t, res.error));
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4">
      <h2>{t("privacy")}</h2>
      {error && <Notice tone="notice" role="alert">{error}</Notice>}
      <label className="neo-card flex items-start gap-4 p-5">
        <input type="checkbox" className="mt-1 size-5" checked={hideLiving} disabled={busy} onChange={(e) => set({ hideLivingFromViewers: e.target.checked })} />
        <span className="flex flex-col gap-1">
          <span className="font-semibold">{t("hideLiving")}</span>
          <span className="text-sm text-ink-muted">{t("hideLivingHint")}</span>
        </span>
      </label>
      <label className="neo-card flex items-start gap-4 p-5">
        <input type="checkbox" className="mt-1 size-5" checked={crossFamily} disabled={busy} onChange={(e) => set({ allowCrossFamilyMatch: e.target.checked })} />
        <span className="flex flex-col gap-1">
          <span className="font-semibold">{t("crossFamily")}</span>
          <span className="text-sm text-ink-muted">{t("crossFamilyHint")}</span>
        </span>
      </label>
    </section>
  );
}
