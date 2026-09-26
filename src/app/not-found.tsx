import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 pt-4">
      <p>{t("errors.notFound")}</p>
      <Link href="/trees" className={buttonClass("secondary")}>
        {t("nav.myTrees")}
      </Link>
    </div>
  );
}
