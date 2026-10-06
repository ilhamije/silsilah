import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { HttpError } from "@/lib/errors";
import { getReview } from "@/lib/merge/read";
import { Notice, PageHeader } from "@/components/ui";
import { MergeReview } from "@/components/merge/merge-review";

export default async function MergeReviewPage({ params }: PageProps<"/trees/[treeId]/merges/[suggestionId]">) {
  const { treeId, suggestionId } = await params;
  const user = await requireUserOrRedirect(`/trees/${treeId}/merges/${suggestionId}`);
  const data = await getReview(db, user.id, suggestionId).catch((e: unknown) => {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  });
  if (data.treeA.id !== treeId && data.treeB.id !== treeId) notFound();
  const t = await getTranslations("merge");

  return (
    <div className="flex flex-col gap-8">
      <p>
        <Link href={`/trees/${treeId}/merges`}>← {t("title")}</Link>
      </p>
      <PageHeader
        eyebrow={t(`band.${data.band}`)}
        title={t("reviewTitle", { a: data.treeA.name ?? t("anotherFamily"), b: data.treeB.name ?? t("anotherFamily") })}
        lede={t("reviewLede")}
      />
      {data.hidden === "requester" && <Notice>{t("hiddenRequester", { count: data.pairCount })}</Notice>}
      {data.hidden === "responder" && <Notice>{t("hiddenResponder")}</Notice>}
      <MergeReview treeId={treeId} data={data} />
    </div>
  );
}
