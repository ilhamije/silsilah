import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { HttpError } from "@/lib/errors";
import { readTree } from "@/lib/tree/read";
import Link from "next/link";
import { can } from "@/lib/authz/roles";
import { buttonClass, Notice, PageHeader } from "@/components/ui";

export default async function TreePage({ params, searchParams }: PageProps<"/trees/[treeId]">) {
  const { treeId } = await params;
  const imported = Number((await searchParams).imported);
  const user = await requireUserOrRedirect(`/trees/${treeId}`);
  const data = await readTree(db, user.id, treeId).catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const editor = data.lastEditor && data.lastEditor.id !== user.id ? data.lastEditor : null;

  return (
    <div className="flex flex-col">
      <PageHeader
        eyebrow={t(`roles.${data.role}`)}
        title={data.tree.name}
        lede={
          editor
            ? t("tree.updatedBy", {
                name: editor.name ?? editor.email,
                when: format.relativeTime(data.tree.updatedAt),
              })
            : undefined
        }
      />

      {imported > 0 && (
        <div className="mb-10">
          <Notice role="status">{t("tree.imported", { count: imported })}</Notice>
        </div>
      )}

      {can(data.role, "image.upload") && (
        <p className="mb-10">
          <Link href={`/trees/${treeId}/upload`} className={buttonClass("primary")}>
            {t("tree.addFromPhoto")}
          </Link>
        </p>
      )}

      <Notice>{t("tree.comingSoon")}</Notice>

      <section aria-labelledby="people-heading" className="mt-14 flex flex-col gap-6">
        <h2 id="people-heading">{t("tree.people")}</h2>
        {data.people.length === 0 ? (
          <p className="measure border-t border-rule pt-6 text-ink-muted">{t("tree.noPeople")}</p>
        ) : (
          <ul className="flex flex-col border-t border-rule">
            {data.people.map((p) => {
              const details = p.redacted
                ? t("tree.hidden")
                : [p.birthDate, p.deathDate && `† ${p.deathDate}`, p.birthPlace].filter(Boolean).join(" · ") ||
                  (p.isLiving === false ? t("tree.deceased") : "");
              return (
                <li key={p.id} className="flex flex-col gap-1 border-b border-rule py-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <span className="font-display text-2xl">{p.fullName}</span>
                  {details && <span className="text-sm text-ink-muted">{details}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
