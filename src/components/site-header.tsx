import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth, signOut } from "@/auth";
import { isAdminEmail } from "@/lib/authz/admin";
import { LanguageToggle } from "./language-toggle";

export async function SiteHeader() {
  const [session, t] = await Promise.all([auth(), getTranslations()]);
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
        <Link href={session ? "/trees" : "/"} className="mr-auto flex min-h-11 items-center text-lg font-bold text-brand">
          {t("app.name")}
        </Link>
        {isAdminEmail(session?.user?.email) && (
          <Link href="/admin" className="flex min-h-11 items-center rounded-xl px-2 text-sm font-medium text-muted hover:text-foreground">
            {t("nav.admin")}
          </Link>
        )}
        <LanguageToggle />
        {session && (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className="min-h-11 rounded-xl px-3 text-sm font-medium text-muted hover:text-foreground">
              {t("nav.signOut")}
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
