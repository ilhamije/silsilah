import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { can } from "@/lib/authz/roles";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { HttpError } from "@/lib/errors";
import { Notice, PageHeader } from "@/components/ui";
import { UploadWorkspace } from "@/components/upload/upload-workspace";

export const metadata = { title: "Add pages" };

export default async function UploadPage({ params }: PageProps<"/trees/[treeId]/upload">) {
  const { treeId } = await params;
  const user = await requireUserOrRedirect(`/trees/${treeId}/upload`);
  const access = await assertTreePermission(db, user.id, treeId, "tree.read").catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const t = await getTranslations("upload");

  return (
    <div className="flex flex-col">
      <p className="mb-6">
        <Link href={`/trees/${treeId}`}>← {access.tree.name}</Link>
      </p>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
      {can(access.role, "image.upload") ? (
        <UploadWorkspace treeId={treeId} />
      ) : (
        <Notice>{t("viewerOnly")}</Notice>
      )}
    </div>
  );
}
