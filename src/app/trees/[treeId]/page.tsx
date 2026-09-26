import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { HttpError } from "@/lib/errors";
import { readTree } from "@/lib/tree/read";
import { Card } from "@/components/ui";

export default async function TreePage({ params }: PageProps<"/trees/[treeId]">) {
  const { treeId } = await params;
  const user = await requireUserOrRedirect(`/trees/${treeId}`);
  const data = await readTree(db, user.id, treeId).catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const editor = data.lastEditor && data.lastEditor.id !== user.id ? data.lastEditor : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{data.tree.name}</h1>
        <p className="text-sm text-muted">
          {t(`roles.${data.role}`)}
          {editor &&
            ` · ${t("tree.updatedBy", {
              name: editor.name ?? editor.email,
              when: format.relativeTime(data.tree.updatedAt),
            })}`}
        </p>
      </div>

      <p className="rounded-xl bg-brand-soft p-3 text-sm">{t("tree.comingSoon")}</p>

      <section aria-labelledby="people-heading" className="flex flex-col gap-2">
        <h2 id="people-heading" className="text-lg font-semibold">
          {t("tree.people")}
        </h2>
        {data.people.length === 0 ? (
          <p className="text-muted">{t("tree.noPeople")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.people.map((p) => (
              <li key={p.id}>
                <Card className="flex flex-col gap-0.5">
                  <span className="font-medium">{p.fullName}</span>
                  <span className="text-sm text-muted">
                    {p.redacted
                      ? t("tree.hidden")
                      : [p.birthDate, p.deathDate && `† ${p.deathDate}`, p.birthPlace].filter(Boolean).join(" · ") ||
                        (p.isLiving === false ? t("tree.deceased") : "")}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
