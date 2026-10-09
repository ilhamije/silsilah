import Link from "next/link";
import { getTranslations } from "next-intl/server";

const links = [
  { href: "/how-to", key: "howTo" },
  { href: "/why", key: "why" },
  { href: "/features", key: "features" },
  { href: "/domain", key: "domain" },
] as const;

export async function SiteFooter() {
  const [t, n] = await Promise.all([getTranslations("footer"), getTranslations("pages.nav")]);
  return (
    <footer className="border-t-4 border-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-8 sm:px-8">
        <nav aria-label={t("about")} className="flex flex-wrap gap-x-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center px-2 text-base font-semibold">
              {n(l.key)}
            </Link>
          ))}
        </nav>
        <p className="measure text-sm text-ink-muted">{t("privacy")}</p>
      </div>
    </footer>
  );
}
