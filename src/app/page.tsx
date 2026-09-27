import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { AlbumFrame, buttonClass, Rule } from "@/components/ui";
import { TreeSketch } from "@/components/tree-sketch";

export default async function Home() {
  if (await auth()) redirect("/trees");
  const t = await getTranslations("home");
  const steps = [
    { title: t("step1Title"), body: t("step1") },
    { title: t("step2Title"), body: t("step2") },
    { title: t("step3Title"), body: t("step3") },
  ];

  return (
    <div className="flex flex-col gap-16 sm:gap-24">
      <section className="grid items-center gap-12 md:grid-cols-[1.15fr_1fr] md:gap-16">
        <div className="flex flex-col gap-6">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>
            {t("headline")} <em className="italic">{t("headlineEm")}</em>
          </h1>
          <p className="measure text-lg text-ink-muted">{t("lede")}</p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link href="/login" className={buttonClass("primary")}>
              {t("cta")}
            </Link>
          </div>
        </div>
        <figure className="flex flex-col gap-3">
          <AlbumFrame className="rotate-[-0.6deg]">
            <TreeSketch />
          </AlbumFrame>
          <figcaption className="text-center font-serif text-lg italic text-ink-muted">{t("caption")}</figcaption>
        </figure>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-8">
        <h2 id="how-heading">{t("howTitle")}</h2>
        <ol className="flex flex-col">
          {steps.map((step, i) => (
            <li key={i} className="grid grid-cols-[3rem_1fr] gap-4 border-t border-rule py-8 sm:grid-cols-[5rem_1fr]">
              <span aria-hidden className="font-serif text-[2.75rem] leading-none text-accent">
                {i + 1}
              </span>
              <div className="flex flex-col gap-2">
                <h3>{step.title}</h3>
                <p className="measure text-ink-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <Rule />
        <p className="measure font-serif text-2xl italic leading-snug">{t("privacy")}</p>
      </section>
    </div>
  );
}
