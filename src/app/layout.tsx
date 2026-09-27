import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { themeColor } from "@/lib/theme";
import { getTheme } from "@/lib/theme-server";
import { display, sans } from "./fonts";
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

// Light interface only; the user can switch to Dim (less glare), never to a dark theme.
export async function generateViewport(): Promise<Viewport> {
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: themeColor[await getTheme()],
    colorScheme: "light",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, theme, t] = await Promise.all([getLocale(), getTheme(), getTranslations("nav")]);
  return (
    <html lang={locale} data-theme={theme} className={`${display.variable} ${sans.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <a
            href="#main"
            className="sr-only rounded-full border-3 border-ink bg-yellow px-4 py-3 font-bold text-on-brand focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
          >
            {t("skipToContent")}
          </a>
          <SiteHeader theme={theme} />
          <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-5 pb-20 pt-10 sm:px-8 sm:pt-16">
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
