import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui";

export default async function CheckEmailPage() {
  const t = await getTranslations("login");
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 pt-4">
      <h1 className="text-2xl font-bold">{t("checkTitle")}</h1>
      <p>{t("checkBody")}</p>
      <p className="text-muted">{t("checkSpam")}</p>
      <Link href="/login" className={buttonClass("secondary")}>
        {t("back")}
      </Link>
    </div>
  );
}
