import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pages.howTo"))("title") };
}

export default async function HowToPage() {
  const [t, p] = await Promise.all([getTranslations("pages.howTo"), getTranslations("pages")]);
  const items = t.raw("items") as string[];
  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <PageHeader eyebrow={p("eyebrow")} title={t("title")} lede={t("lede")} />
      <ol className="flex flex-col">
        {items.map((item, i) => (
          <li key={i} className="grid grid-cols-[3rem_1fr] gap-4 border-t border-rule py-5">
            <span aria-hidden className="flex size-10 items-center justify-center rounded-full border-3 border-ink bg-yellow font-display text-xl font-bold text-on-brand shadow-neo-xs">
              {i + 1}
            </span>
            <p className="measure pt-1">{item}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
