import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pages.features"))("title") };
}

export default async function FeaturesPage() {
  const [t, p] = await Promise.all([getTranslations("pages.features"), getTranslations("pages")]);
  const lists = [
    { title: t("nowTitle"), items: t.raw("now") as string[], mark: "✓" },
    { title: t("nextTitle"), items: t.raw("next") as string[], mark: "○" },
  ];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <PageHeader eyebrow={p("eyebrow")} title={t("title")} lede={t("lede")} />
      {lists.map((list) => (
        <section key={list.title} className="flex flex-col gap-4">
          <h2>{list.title}</h2>
          <ul className="flex flex-col">
            {list.items.map((item) => (
              <li key={item} className="grid grid-cols-[2rem_1fr] gap-2 border-t border-rule py-3">
                <span aria-hidden className="font-bold text-accent">{list.mark}</span>
                <span className="measure">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm text-ink-muted">{t("note")}</p>
    </div>
  );
}
