import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buttonClass, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pages.domain"))("title") };
}

export default async function DomainPage() {
  const [t, p] = await Promise.all([getTranslations("pages.domain"), getTranslations("pages")]);
  const body = t.raw("body") as string[];
  // Set SUPPORT_URL (a donation or payment page) to show the button.
  const supportUrl = process.env.SUPPORT_URL;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader eyebrow={p("eyebrow")} title={t("title")} lede={t("lede")} />
      {body.map((para) => (
        <p key={para} className="measure">{para}</p>
      ))}
      <div className="flex flex-col gap-4 border-t border-rule pt-8">
        {supportUrl ? (
          <a href={supportUrl} target="_blank" rel="noopener noreferrer" className={`${buttonClass("primary")} self-start`}>
            {t("cta")}
          </a>
        ) : (
          <p className="font-semibold">{t("noLink")}</p>
        )}
        <p className="font-display text-xl italic text-ink-muted">{t("thanks")}</p>
      </div>
    </div>
  );
}
