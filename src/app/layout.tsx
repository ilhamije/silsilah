import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("tagline"),
    applicationName: t("name"),
    appleWebApp: { capable: true, title: t("name"), statusBarStyle: "default" },
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#12110f" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("nav")]);
  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <NextIntlClientProvider>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">
            {t("skipToContent")}
          </a>
          <SiteHeader />
          <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
