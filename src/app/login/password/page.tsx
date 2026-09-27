import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { auth } from "@/auth";
import { Button, Field, Input, Notice, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import {
  createPasswordSession,
  passwordLoginSecret,
  passwordMatches,
  SESSION_MAX_AGE,
  sessionCookieName,
} from "@/lib/password-login";
import { safeRedirect } from "@/lib/safe-redirect";

/** Temporary: sign in with the shared password from PASSWORD_LOGIN_SECRET (see src/lib/password-login.ts). */
export default async function PasswordLoginPage({ searchParams }: PageProps<"/login/password">) {
  if (!passwordLoginSecret()) notFound();
  const params = await searchParams;
  const callbackUrl = safeRedirect(params.callbackUrl);
  if (await auth()) redirect(callbackUrl);
  const t = await getTranslations("login");
  const back = callbackUrl === "/trees" ? "" : `?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  async function signInWithPassword(formData: FormData) {
    "use server";
    const secret = passwordLoginSecret();
    if (!secret) notFound();
    const email = z.email().max(254).safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
    const password = String(formData.get("password") ?? "");
    if (!email.success || !passwordMatches(password, secret)) {
      // Slow down guessing; the message doesn't say which field was wrong.
      await new Promise((r) => setTimeout(r, 1000));
      redirect(`/login/password?error=1${back ? `&${back.slice(1)}` : ""}`);
    }
    const session = await createPasswordSession(db, email.data);
    // Same cookie Auth.js sets after a magic link, so auth() picks it up.
    const secure = (await headers()).get("x-forwarded-proto") === "https";
    (await cookies()).set(sessionCookieName(secure), session.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
      expires: session.expires,
      maxAge: SESSION_MAX_AGE,
    });
    redirect(callbackUrl);
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col">
      <PageHeader eyebrow={t("eyebrow")} title={t("passwordTitle")} lede={t("passwordIntro")} />
      <div className="flex flex-col gap-6 border-t border-rule pt-10">
        {params.error && (
          <Notice tone="notice" role="alert">
            {t("passwordError")}
          </Notice>
        )}
        <form action={signInWithPassword} className="flex flex-col gap-6">
          <Field id="email" label={t("email")}>
            <Input id="email" name="email" type="email" required autoComplete="email" inputMode="email" />
          </Field>
          <Field id="password" label={t("password")}>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </Field>
          <Button type="submit" className="self-start">
            {t("passwordSubmit")}
          </Button>
        </form>
        <Link href={`/login${back}`} className="self-start">
          {t("passwordBack")}
        </Link>
      </div>
    </div>
  );
}
