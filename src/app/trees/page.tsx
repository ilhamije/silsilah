import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { listTreesForUser } from "@/lib/trees";
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
        <ul className="flex flex-col border-t border-rule">
          {trees.map((tree) => (
            <li key={tree.id} className="border-b border-rule">
              <Link
                href={`/trees/${tree.id}`}
                className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-7 text-ink no-underline transition-colors hover:bg-accent-tint/60 sm:px-4"
              >
                <span className="font-serif text-[1.875rem] leading-tight group-hover:text-accent">{tree.name}</span>
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

      <section aria-labelledby="new-tree-heading" className="mt-16 grid gap-8 border-t border-rule pt-10 md:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-3">
          <h2 id="new-tree-heading">{t("trees.create")}</h2>
          <p className="measure text-ink-muted">{t("trees.createIntro")}</p>
        </div>
        <form action={createTreeAction} className="flex flex-col gap-6">
          <Field id="name" label={t("trees.nameLabel")} hint={t("trees.nameHint")}>
            <Input id="name" name="name" required maxLength={120} aria-describedby="name-hint" />
          </Field>
          <Button type="submit" className="self-start">
            {t("trees.createSubmit")}
          </Button>
        </form>
      </section>
    </div>
  );
}
