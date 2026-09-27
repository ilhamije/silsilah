import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { HttpError } from "@/lib/errors";
import { existingPeopleForReview } from "@/lib/import/service";
import { PageHeader } from "@/components/ui";
import { ReviewWorkspace } from "@/components/review/review-workspace";

export const metadata = { title: "Review" };

export default async function ReviewPage({ params }: PageProps<"/trees/[treeId]/review">) {
  const { treeId } = await params;
  const user = await requireUserOrRedirect(`/trees/${treeId}/review`);
  const [existing, tree] = await Promise.all([
    existingPeopleForReview(db, user.id, treeId),
    db.familyTree.findUnique({ where: { id: treeId }, select: { name: true } }),
  ]).catch((e: unknown) => {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  });
  const t = await getTranslations("review");
  return (
    <div className="flex flex-col">
      <p className="mb-6">
        <Link href={`/trees/${treeId}`}>← {tree!.name}</Link>
      </p>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
      <ReviewWorkspace
        treeId={treeId}
        treeName={tree!.name}
        existingPeople={existing.people}
        existingEdges={existing.edges}
      />
    </div>
  );
}
