import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireAdminOrRedirect } from "@/lib/authz/session";
import { parseAdminEmails } from "@/lib/authz/admin";
import { getAdminStats } from "@/lib/admin-stats";
import { Card } from "@/components/ui";

export const metadata = { title: "Admin" };

// App-wide counts only. Admins never see the contents of family trees here.
export default async function AdminPage() {
  await requireAdminOrRedirect("/admin");
  const t = await getTranslations("admin");
  const { users, trees, people, images, rejections30d: rejections } = await getAdminStats(db);
  const stats = [
    [t("users"), users],
    [t("trees"), trees],
    [t("people"), people],
    [t("images"), images],
    [t("rejections30d"), rejections],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted">{t("privacyNote")}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <Card key={label}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-2xl font-bold tabular-nums">{value}</dd>
          </Card>
        ))}
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("admins")}</h2>
        <ul className="text-sm">
          {[...parseAdminEmails(process.env.ADMIN_EMAILS)].map((email) => (
            <li key={email}>{email}</li>
          ))}
        </ul>
        <p className="text-sm text-muted">{t("howToChange")}</p>
      </section>
      <p className="rounded-xl bg-brand-soft p-3 text-sm">{t("comingSoon")}</p>
    </div>
  );
}
