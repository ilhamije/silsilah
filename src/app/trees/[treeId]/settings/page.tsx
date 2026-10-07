import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { can } from "@/lib/authz/roles";
import { HttpError } from "@/lib/errors";
import { listMembers } from "@/lib/sharing/members";
import { listActiveInvitations } from "@/lib/sharing/invitations";
import { listActivity } from "@/lib/sharing/activity";
import { PageHeader } from "@/components/ui";
import { MembersSection } from "@/components/settings/members-section";
import { InviteSection } from "@/components/settings/invite-section";
import { PrivacySection } from "@/components/settings/privacy-section";
import { DangerSection } from "@/components/settings/danger-section";

export default async function SettingsPage({ params }: PageProps<"/trees/[treeId]/settings">) {
  const { treeId } = await params;
  const user = await requireUserOrRedirect(`/trees/${treeId}/settings`);
  const access = await assertTreePermission(db, user.id, treeId, "tree.read").catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const owner = can(access.role, "invite.manage");
  const [t, format, members, invitations, activity] = await Promise.all([
    getTranslations("settings"),
    getFormatter(),
    listMembers(db, user.id, treeId),
    owner ? listActiveInvitations(db, user.id, treeId) : [],
    listActivity(db, user.id, treeId),
  ]);

  return (
    <div className="flex flex-col gap-12">
      <p>
        <Link href={`/trees/${treeId}`}>← {access.tree.name}</Link>
      </p>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={owner ? t("ledeOwner") : t("ledeMember")} />

      <MembersSection
        treeId={treeId}
        canManage={owner}
        selfId={user.id}
        members={members.map((m) => ({
          userId: m.userId,
          name: m.user.name ?? m.user.email,
          email: m.user.email,
          role: m.role,
        }))}
      />

      {owner && (
        <InviteSection
          treeId={treeId}
          invitations={invitations.map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            singleUse: i.singleUse,
            used: i.useCount,
            expires: format.relativeTime(i.expiresAt),
          }))}
        />
      )}

      {owner && (
        <PrivacySection
          treeId={treeId}
          hideLiving={access.tree.hideLivingFromViewers}
          crossFamily={access.tree.allowCrossFamilyMatch}
        />
      )}

      <section className="flex flex-col gap-4">
        <h2>{t("activity")}</h2>
        {activity.length === 0 ? (
          <p className="text-ink-muted">{t("noActivity")}</p>
        ) : (
          <ul className="flex flex-col border-t border-rule">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-rule py-2">
                <span>
                  {a.who ?? t("someone")} · {t.has(`action.${a.action}`) ? t(`action.${a.action}`) : a.action}
                  {t.has(`entity.${a.entityType}`) ? ` ${t(`entity.${a.entityType}`)}` : ""}
                </span>
                <span className="text-sm text-ink-muted">{format.relativeTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DangerSection treeId={treeId} treeName={access.tree.name} isOwner={can(access.role, "tree.delete")} />
    </div>
  );
}
