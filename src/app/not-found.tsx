import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <div className="mx-auto flex max-w-xl flex-col">
      <PageHeader eyebrow="404" title={t("errors.notFoundTitle")} lede={t("errors.notFound")} />
      <p className="border-t border-rule pt-8">
        <Link href="/trees">{t("nav.myTrees")}</Link>
      </p>
    </div>
  );
}
