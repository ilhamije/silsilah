import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { listTreesForUser } from "@/lib/trees";
import { Button, Card, Input } from "@/components/ui";
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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("trees.title")}</h1>

      <details className="group rounded-2xl border border-border bg-surface" open={trees.length === 0}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 font-semibold text-brand">
          + {t("trees.create")}
        </summary>
        <form action={createTreeAction} className="flex flex-col gap-3 px-4 pb-4">
          <label htmlFor="name" className="font-medium">
            {t("trees.nameLabel")}
          </label>
          <Input id="name" name="name" required maxLength={120} placeholder={t("trees.namePlaceholder")} />
          <Button type="submit">{t("trees.createSubmit")}</Button>
        </form>
      </details>

      {trees.length === 0 ? (
        <p className="text-muted">{t("trees.empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {trees.map((tree) => (
            <li key={tree.id}>
              <Link href={`/trees/${tree.id}`} className="block rounded-2xl focus-visible:outline-offset-4">
                <Card className="flex flex-col gap-1 hover:border-brand">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold">{tree.name}</h2>
                    <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                      {t(`roles.${tree.role}`)}
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    {t("trees.people", { count: tree._count.people })} ·{" "}
                    {t("trees.members", { count: tree._count.members })}
                  </p>
                  <p className="text-sm text-muted">
                    {t("trees.updated", { date: format.relativeTime(tree.updatedAt) })}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
