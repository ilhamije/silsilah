import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <p className="measure text-sm text-ink-muted">{t("privacy")}</p>
      </div>
    </footer>
  );
}
