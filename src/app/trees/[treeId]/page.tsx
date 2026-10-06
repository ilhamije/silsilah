import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/authz/session";
import { HttpError } from "@/lib/errors";
import { readTree } from "@/lib/tree/read";
import Link from "next/link";
import { can } from "@/lib/authz/roles";
import { buttonClass, Notice } from "@/components/ui";
import { TreeTitle } from "@/components/tree/tree-title";
import { TreeWorkspace } from "@/components/tree/tree-workspace";
import type { TreePerson } from "@/components/tree/types";
import { LiveRefresh } from "@/components/tree/live-refresh";
import { SuggestionsList } from "@/components/tree/suggestions-list";
import { listMerges } from "@/lib/merge/read";
import { listPendingSuggestions } from "@/lib/sharing/suggested-edits";

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
  const canEdit = can(data.role, "person.write");
  const people = data.people.map(
    (p): TreePerson => ({
      id: p.id,
      fullName: p.fullName,
      gender: p.gender,
      birthDate: p.birthDate,
      deathDate: p.deathDate,
      birthPlace: p.birthPlace,
      notes: p.notes,
      birthYear: p.birthYear,
      deathYear: p.deathYear,
      isLiving: p.isLiving,
      livingIsManual: p.livingIsManual,
      version: p.version,
      redacted: p.redacted,
    }),
  );
  const matches = can(data.role, "merge.decide")
    ? (await listMerges(db, user.id, treeId)).filter((m) => m.status !== "ACCEPTED").length
    : 0;
  const suggestions = can(data.role, "edit.review") ? await listPendingSuggestions(db, user.id, treeId) : [];

  return (
    <div className="flex flex-col">
      {/* PageHeader's layout, with a title owners can rename in place. */}
      <header className="flex flex-col gap-4 pb-10">
        <p className="eyebrow">{t(`roles.${data.role}`)}</p>
        <TreeTitle treeId={treeId} name={data.tree.name} canRename={can(data.role, "tree.settings")} />
        {editor && (
          <p className="measure text-lg text-ink-muted">
            {t("tree.updatedBy", {
              name: editor.name ?? editor.email,
              when: format.relativeTime(data.tree.updatedAt),
            })}
          </p>
        )}
      </header>

      {imported > 0 && (
        <div className="mb-10">
          <Notice role="status">{t("tree.imported", { count: imported })}</Notice>
        </div>
      )}

      {matches > 0 && (
        <div className="mb-10">
          <Notice role="status">
            {t("merge.bannerCount", { count: matches })}{" "}
            <Link href={`/trees/${treeId}/merges`}>{t("merge.bannerLink")}</Link>
          </Notice>
        </div>
      )}

      {can(data.role, "image.upload") && (
        <p className="mb-10">
          <Link href={`/trees/${treeId}/upload`} className={buttonClass("primary")}>
            {t("tree.addFromPhoto")}
          </Link>
        </p>
      )}

      <TreeWorkspace
        treeId={treeId}
        canEdit={canEdit}
        people={people}
        relationships={data.relationships}
        selfId={data.selfPersonId}
      />

      {suggestions.length > 0 && (
        <div className="mt-14">
          <SuggestionsList
            treeId={treeId}
            people={people}
            items={suggestions.map((s) => ({
              id: s.id,
              personId: s.personId,
              submittedBy: s.submittedBy.name ?? s.submittedBy.email,
              when: format.relativeTime(s.createdAt),
              changes: s.proposedChanges as Record<string, unknown>,
            }))}
          />
        </div>
      )}

      {canEdit && (
        <p className="mt-14 border-t-3 border-ink pt-6">
          <Link href={`/trees/${treeId}/deleted`}>{t("tree.recentlyDeleted")}</Link>
        </p>
      )}

      <LiveRefresh
        updatedAt={data.tree.updatedAt.toISOString()}
        otherEditor={editor ? (editor.name ?? editor.email) : null}
      />
    </div>
  );
}
