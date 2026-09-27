import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { HttpError } from "@/lib/errors";
import { PageHeader } from "@/components/ui";
import { ReviewPreview } from "@/components/review/review-preview";

export const metadata = { title: "Review" };

export default async function ReviewPage({ params }: PageProps<"/trees/[treeId]/review">) {
  const { treeId } = await params;
  const user = await requireUserOrRedirect(`/trees/${treeId}/review`);
  const access = await assertTreePermission(db, user.id, treeId, "image.upload").catch((e: unknown) => {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  });
  const t = await getTranslations("review");
  return (
    <div className="flex flex-col">
      <p className="mb-6">
        <Link href={`/trees/${treeId}`}>← {access.tree.name}</Link>
      </p>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
      <ReviewPreview treeId={treeId} />
    </div>
  );
}
