import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireAdminOrRedirect } from "@/lib/authz/session";
import { parseAdminEmails } from "@/lib/authz/admin";
import { getAdminStats } from "@/lib/admin-stats";
import { Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Admin" };

// App-wide counts only. Admins never see the contents of family trees here.
export default async function AdminPage() {
  await requireAdminOrRedirect("/admin");
  const t = await getTranslations("admin");
  const { users, trees, people, extractions30d, rejections30d } = await getAdminStats(db);
  const stats = [
    [t("users"), users],
    [t("trees"), trees],
    [t("people"), people],
    [t("extractions30d"), extractions30d],
    [t("rejections30d"), rejections30d],
  ] as const;

  return (
    <div className="flex flex-col">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={t("privacyNote")} />
      <dl className="grid grid-cols-2 border-t border-rule sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 border-b border-rule py-6 pr-4">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="font-display text-[2.75rem] leading-none tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="mt-14 flex flex-col gap-4">
        <h2>{t("admins")}</h2>
        <ul className="flex flex-col border-t border-rule">
          {[...parseAdminEmails(process.env.ADMIN_EMAILS)].map((email) => (
            <li key={email} className="border-b border-rule py-3">
              {email}
            </li>
          ))}
        </ul>
        <p className="measure text-sm text-ink-muted">{t("howToChange")}</p>
      </section>
      <div className="mt-12">
        <Notice>{t("comingSoon")}</Notice>
      </div>
    </div>
  );
}
