import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { buttonClass } from "@/components/ui";

export default async function Home() {
  if (await auth()) redirect("/trees");
  const t = await getTranslations();
  const steps = [t("home.step1"), t("home.step2"), t("home.step3")];
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-6">
      <h1 className="text-3xl font-bold leading-tight">{t("app.tagline")}</h1>
      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-3">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft font-bold text-brand">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <Link href="/login" className={buttonClass()}>
        {t("home.cta")}
      </Link>
      <p className="text-sm text-muted">{t("home.privacy")}</p>
    </div>
  );
}
