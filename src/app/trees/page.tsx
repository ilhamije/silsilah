import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { listTreesForUser } from "@/lib/trees";
import { TEMPLATE_IDS } from "@/lib/tree/templates";
import { Button, Field, Input, PageHeader } from "@/components/ui";
import { createTreeAction } from "./actions";

export const metadata = { title: "Trees" };

export default async function TreesPage() {
  const user = await requireUserOrRedirect("/trees");
  const [trees, t, format] = await Promise.all([
    listTreesForUser(db, user.id),
    getTranslations(),
    getFormatter(),
  ]);

  return (
    <div className="flex flex-col">
      <PageHeader
        eyebrow={t("trees.eyebrow")}
        title={t("trees.title")}
        lede={trees.length === 0 ? t("trees.empty") : undefined}
      />

      {trees.length > 0 && (
        <ul className="flex flex-col gap-6">
          {trees.map((tree) => (
            <li key={tree.id}>
              <Link
                href={`/trees/${tree.id}`}
                className="neo-card group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 px-5 py-6 text-ink no-underline transition-[translate,box-shadow,background-color] duration-150 hover:translate-x-0.5 hover:translate-y-0.5 hover:bg-accent-tint hover:text-ink hover:shadow-neo-sm sm:px-6"
              >
                <span className="font-display text-[1.875rem] font-bold leading-tight">{tree.name}</span>
                <span aria-hidden className="row-span-2 text-2xl text-accent transition-transform group-hover:translate-x-1">
                  →
                </span>
                <span className="text-sm text-ink-muted">
                  {t(`roles.${tree.role}`)} · {t("trees.people", { count: tree._count.people })} ·{" "}
                  {t("trees.members", { count: tree._count.members })} ·{" "}
                  {t("trees.updated", { date: format.relativeTime(tree.updatedAt) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="new-tree-heading" className="mt-16 grid gap-8 border-t-4 border-ink pt-10 md:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-3">
          <h2 id="new-tree-heading">{t("trees.create")}</h2>
          <p className="measure text-ink-muted">{t("trees.createIntro")}</p>
        </div>
        <form action={createTreeAction} className="flex flex-col gap-6">
          <Field id="name" label={t("trees.nameLabel")} hint={t("trees.nameHint")}>
            <Input id="name" name="name" required maxLength={120} aria-describedby="name-hint" />
          </Field>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 font-semibold">{t("templates.legend")}</legend>
            {(["", ...TEMPLATE_IDS] as const).map((id) => (
              <label
                key={id || "blank"}
                className="flex cursor-pointer items-start gap-4 rounded-field border-3 border-ink bg-mat px-4 py-3 has-[:checked]:bg-accent-tint has-[:checked]:shadow-neo-sm has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-ink"
              >
                <input
                  type="radio"
                  name="template"
                  value={id}
                  defaultChecked={id === ""}
                  className="mt-1 size-6 shrink-0 accent-ink focus-visible:outline-none"
                />
                <span className="flex flex-col">
                  <span className="font-semibold">{id ? t(`templates.options.${id}.title`) : t("templates.blank.title")}</span>
                  <span className="text-sm text-ink-muted">
                    {id ? t(`templates.options.${id}.hint`) : t("templates.blank.hint")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <Button type="submit" className="self-start">
            {t("trees.createSubmit")}
          </Button>
        </form>
      </section>
    </div>
  );
}
