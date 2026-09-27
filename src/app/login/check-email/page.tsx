import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";

export default async function CheckEmailPage() {
  const t = await getTranslations("login");
  return (
    <div className="mx-auto flex max-w-xl flex-col">
      <PageHeader eyebrow={t("eyebrow")} title={t("checkTitle")} lede={t("checkBody")} />
      <div className="flex flex-col gap-6 border-t border-rule pt-10">
        <p className="measure text-ink-muted">{t("checkSpam")}</p>
        <p>
          <Link href="/login">{t("back")}</Link>
        </p>
      </div>
    </div>
  );
}
