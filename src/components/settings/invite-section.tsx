"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { inviteAction, revokeInviteAction } from "@/app/trees/[treeId]/settings/actions";
import { Button, Field, Input, Notice } from "@/components/ui";
import { selectClass } from "./members-section";
import { settingsError } from "./errors";

type Role = "OWNER" | "EDITOR" | "VIEWER";
export type InviteRow = { id: string; email: string | null; role: Role; singleUse: boolean; used: number; expires: string };

export function InviteSection({ treeId, invitations }: { treeId: string; invitations: InviteRow[] }) {
  const t = useTranslations("settings");
  const r = useTranslations("roles");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [days, setDays] = useState(7);
  const [singleUse, setSingleUse] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: string; emailed?: boolean; hadEmail: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await inviteAction(treeId, { email: email.trim() || null, role, singleUse, expiresInDays: days });
    setBusy(false);
    if (!res.ok) return setError(settingsError(t, res.error));
    setResult({ link: res.link ?? "", emailed: res.emailed, hadEmail: !!email.trim() });
    setEmail("");
    router.refresh();
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h2>{t("invite")}</h2>
      <form onSubmit={create} className="neo-card flex flex-col gap-5 p-5">
        <Field id="invite-email" label={t("inviteEmail")} hint={t("inviteEmailHint")}>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" aria-describedby="invite-email-hint" />
        </Field>
        <div className="flex flex-wrap gap-6">
          <Field id="invite-role" label={t("inviteRole")}>
            <select id="invite-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="VIEWER">{r("VIEWER")}</option>
              <option value="EDITOR">{r("EDITOR")}</option>
              {email.trim() && <option value="OWNER">{r("OWNER")}</option>}
            </select>
          </Field>
          <Field id="invite-days" label={t("inviteDays")}>
            <select id="invite-days" className={selectClass} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 7, 14, 30].map((d) => (
                <option key={d} value={d}>{t("days", { count: d })}</option>
              ))}
            </select>
          </Field>
        </div>
        {!email.trim() && (
          <label className="flex items-center gap-3">
            <input type="checkbox" className="size-5" checked={singleUse} onChange={(e) => setSingleUse(e.target.checked)} />
            {t("singleUse")}
          </label>
        )}
        {error && <Notice tone="notice" role="alert">{error}</Notice>}
        <div>
          <Button type="submit" disabled={busy}>{email.trim() ? t("sendInvite") : t("makeLink")}</Button>
        </div>
      </form>

      {result && (
        <Notice role="status">
          <div className="flex flex-col gap-3">
            {result.hadEmail && <p>{result.emailed ? t("emailSent") : t("emailFailed")}</p>}
            <p>{t("linkOnce")}</p>
            <code className="break-all rounded-field bg-mat px-3 py-2 text-sm">{result.link}</code>
            <div>
              <Button variant="secondary" onClick={() => copy(result.link)}>{copied ? t("copied") : t("copy")}</Button>
            </div>
          </div>
        </Notice>
      )}

      {invitations.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3>{t("openInvites")}</h3>
          <ul className="flex flex-col border-t border-rule">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3">
                <span className="flex flex-col">
                  <span className="font-semibold">{i.email ?? t("shareableLink")} · {r(i.role)}</span>
                  <span className="text-sm text-ink-muted">
                    {i.singleUse ? t("oneUse") : t("manyUses", { count: i.used })} · {t("expires", { when: i.expires })}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await revokeInviteAction(treeId, i.id);
                    router.refresh();
                  }}
                >
                  {t("revoke")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
