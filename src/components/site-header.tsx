import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth, signOut } from "@/auth";
import { isAdminEmail } from "@/lib/authz/admin";
import { LanguageToggle } from "./language-toggle";

const navLink =
  "inline-flex min-h-11 items-center px-2 text-base font-medium text-accent underline decoration-transparent decoration-1 underline-offset-[6px] hover:text-accent-strong hover:decoration-current";

export async function SiteHeader() {
  const [session, t] = await Promise.all([auth(), getTranslations()]);
  const signedIn = !!session?.user;
  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-8">
        <Link
          href={signedIn ? "/trees" : "/"}
          className="mr-auto inline-flex min-h-11 items-center font-serif text-[1.875rem] leading-none text-ink no-underline hover:text-accent"
        >
          {t("app.name")}
        </Link>
        <LanguageToggle />
        {!signedIn && (
          <Link href="/login" className={navLink}>
            {t("nav.signIn")}
          </Link>
        )}
        {signedIn && (
          <nav aria-label={t("nav.main")} className="flex w-full items-center gap-2 border-t border-rule pt-2 sm:w-auto sm:border-0 sm:pt-0">
            <Link href="/trees" className={navLink}>
              {t("nav.myTrees")}
            </Link>
            {isAdminEmail(session?.user?.email) && (
              <Link href="/admin" className={navLink}>
                {t("nav.admin")}
              </Link>
            )}
            <form
              className="ml-auto sm:ml-0"
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit" className={`${navLink} cursor-pointer`}>
                {t("nav.signOut")}
              </button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
