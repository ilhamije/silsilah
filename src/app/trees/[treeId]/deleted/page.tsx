import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { HttpError } from "@/lib/errors";
import { listRecentlyDeleted, RECENTLY_DELETED_DAYS } from "@/lib/people";
import { PageHeader } from "@/components/ui";
import { RestoreButton } from "@/components/tree/restore-button";

export const metadata = { title: "Recently deleted" };

const DAY = 24 * 60 * 60 * 1000;
const purgeDate = (deletedAt: Date) => new Date(deletedAt.getTime() + RECENTLY_DELETED_DAYS * DAY);

/** People removed in the last 30 days, restorable by editors until the daily purge. */
export default async function RecentlyDeletedPage({ params }: PageProps<"/trees/[treeId]/deleted">) {
  const { treeId } = await params;
  const user = await requireUserOrRedirect(`/trees/${treeId}/deleted`);
  const [people, tree] = await Promise.all([
    listRecentlyDeleted(db, user.id, treeId),
    db.familyTree.findUnique({ where: { id: treeId }, select: { name: true } }),
  ]).catch((e: unknown) => {
    // Non-members get 404 from the service; viewers (403) have nothing to restore here either.
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  });
  const [t, format] = await Promise.all([getTranslations("deleted"), getFormatter()]);

  return (
    <div className="flex flex-col">
      <p className="mb-6">
        <Link href={`/trees/${treeId}`}>← {tree!.name}</Link>
      </p>
      <PageHeader eyebrow={tree!.name} title={t("title")} lede={t("lede", { days: RECENTLY_DELETED_DAYS })} />
      {people.length === 0 ? (
        <p className="measure text-ink-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {people.map((p) => {
            return (
              <li key={p.id} className="neo-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="font-display text-xl font-bold">{p.fullName}</span>
                  <span className="text-sm text-ink-muted">
                    {t("removedWhen", { when: format.relativeTime(p.deletedAt!) })} ·{" "}
                    {t("goneOn", { date: format.dateTime(purgeDate(p.deletedAt!), { dateStyle: "long" }) })}
                  </span>
                </div>
                <RestoreButton treeId={treeId} personId={p.id} name={p.fullName} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
