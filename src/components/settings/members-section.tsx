"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { changeRoleAction, removeMemberAction } from "@/app/trees/[treeId]/settings/actions";
import { Button, Notice } from "@/components/ui";
import { settingsError } from "./errors";

type Role = "OWNER" | "EDITOR" | "VIEWER";
export type MemberRow = { userId: string; name: string; email: string; role: Role };

export const selectClass =
  "min-h-12 rounded-field border-3 border-rule-strong bg-mat px-3 text-base text-ink shadow-neo-sm";

export function MembersSection({ treeId, members, canManage, selfId }: { treeId: string; members: MemberRow[]; canManage: boolean; selfId: string }) {
  const t = useTranslations("settings");
  const r = useTranslations("roles");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, fn: () => ReturnType<typeof changeRoleAction>) {
    setBusy(id);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return setError(settingsError(t, res.error));
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4">
      <h2>{t("members")}</h2>
      {error && <Notice tone="notice" role="alert">{error}</Notice>}
      <ul className="flex flex-col border-t border-rule">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3">
            <span className="flex flex-col">
              <span className="font-semibold">
                {m.name}
                {m.userId === selfId && <span className="text-ink-muted"> ({t("you")})</span>}
              </span>
              {m.name !== m.email && <span className="text-sm text-ink-muted">{m.email}</span>}
            </span>
            {canManage ? (
              <span className="flex flex-wrap items-center gap-3">
                <label className="sr-only" htmlFor={`role-${m.userId}`}>{t("roleFor", { name: m.name })}</label>
                <select
                  id={`role-${m.userId}`}
                  className={selectClass}
                  value={m.role}
                  disabled={busy === m.userId}
                  onChange={(e) => act(m.userId, () => changeRoleAction(treeId, m.userId, e.target.value as Role))}
                >
                  {(["OWNER", "EDITOR", "VIEWER"] as const).map((role) => (
                    <option key={role} value={role}>{r(role)}</option>
                  ))}
                </select>
                {m.userId !== selfId && (
                  <Button
                    variant="secondary"
                    disabled={busy === m.userId}
                    onClick={() => confirm(t("removeConfirm", { name: m.name })) && act(m.userId, () => removeMemberAction(treeId, m.userId))}
                  >
                    {t("remove")}
                  </Button>
                )}
              </span>
            ) : (
              <span className="text-ink-muted">{r(m.role)}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
