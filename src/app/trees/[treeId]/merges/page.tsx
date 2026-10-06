import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { HttpError } from "@/lib/errors";
import { listLinks, listMerges } from "@/lib/merge/read";
import { Notice, PageHeader } from "@/components/ui";
import { UnlinkButton } from "@/components/merge/unlink-button";

export default async function MergesPage({ params }: PageProps<"/trees/[treeId]/merges">) {
  const { treeId } = await params;
  const user = await requireUserOrRedirect(`/trees/${treeId}/merges`);
  const guard = (e: unknown) => {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  };
  const [items, links, t] = await Promise.all([
    listMerges(db, user.id, treeId).catch(guard),
    listLinks(db, user.id, treeId).catch(guard),
    getTranslations("merge"),
  ]);
  const open = items.filter((i) => i.status !== "ACCEPTED");
  const done = items.filter((i) => i.status === "ACCEPTED");

  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
      {open.length === 0 ? (
        <Notice>{t("none")}</Notice>
      ) : (
        <ul className="flex flex-col gap-4">
          {open.map((i) => (
            <li key={i.id}>
              <Link
                href={`/trees/${treeId}/merges/${i.id}`}
                className="neo-card flex flex-col gap-1 px-5 py-5 text-ink no-underline hover:text-ink"
              >
                <span className="font-display text-2xl font-bold">
                  {i.otherTreeName ?? t("anotherFamily")}
                </span>
                <span className="text-sm text-ink-muted">
                  {t(`band.${i.band}`)} · {t("matches", { count: i.pairCount })}
                  {i.awaitingYou ? ` · ${t("awaitingYou")}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(done.length > 0 || links.length > 0) && (
        <section className="flex flex-col gap-4 border-t-3 border-ink pt-8">
          <h2>{t("linked")}</h2>
          <ul className="flex flex-col border-t border-rule">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3">
                <span>
                  {t("linkedAs", { mine: l.mine, theirs: l.theirs, tree: l.otherTree })}
                </span>
                <UnlinkButton linkId={l.id} />
              </li>
            ))}
          </ul>
          {done.map((i) => (
            <Link key={i.id} href={`/trees/${treeId}/merges/${i.id}`}>
              {t("viewAccepted", { name: i.otherTreeName ?? t("anotherFamily") })}
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
