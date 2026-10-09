import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader, Rule } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pages.why"))("title") };
}

export default async function WhyPage() {
  const [t, p] = await Promise.all([getTranslations("pages.why"), getTranslations("pages")]);
  const items = t.raw("items") as { h: string; p: string }[];
  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <PageHeader eyebrow={p("eyebrow")} title={t("title")} lede={t("lede")} />
      <div className="flex flex-col">
        {items.map((item) => (
          <section key={item.h} className="flex flex-col gap-2 border-t border-rule py-6">
            <h2 className="text-2xl">{item.h}</h2>
            <p className="measure text-ink-muted">{item.p}</p>
          </section>
        ))}
      </div>
      <Rule className="mb-8" />
      <p className="measure font-display text-2xl italic leading-snug">{t("closing")}</p>
    </div>
  );
}
