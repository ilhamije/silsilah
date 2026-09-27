import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { Button, Field, Input, Notice, PageHeader } from "@/components/ui";
import { passwordLoginSecret } from "@/lib/password-login";
import { safeRedirect } from "@/lib/safe-redirect";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl = safeRedirect(params.callbackUrl);
  if (await auth()) redirect(callbackUrl);
  const t = await getTranslations("login");

  async function sendLink(formData: FormData) {
    "use server";
    // redirect: false, then redirect ourselves: letting Auth.js redirect a
    // server action into /api/auth/verify-request stalls the client router.
    const next = await signIn("resend", {
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      redirectTo: callbackUrl,
      redirect: false,
    });
    // On failure Auth.js returns its error page URL instead of throwing. This
    // form only sends a sign-in email, so any error means the email didn't go
    // out; only say "check your email" when it did. (The reason is in the
    // server log, prefixed "[email]".)
    const failed = new URL(String(next), "http://local").searchParams.has("error");
    const back = callbackUrl === "/trees" ? "" : `&callbackUrl=${encodeURIComponent(callbackUrl)}`;
    redirect(failed ? `/login?error=email${back}` : "/login/check-email");
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={t("intro")} />
      <div className="flex flex-col gap-6 border-t border-rule pt-10">
        {callbackUrl.startsWith("/invite/") && <Notice>{t("inviteHint")}</Notice>}
        {params.error && (
          <Notice tone="notice" role="alert">
            {params.error === "email"
              ? t("errorEmail")
              : params.error === "Verification"
                ? t("errorExpired")
                : t("error")}
          </Notice>
        )}
        <form action={sendLink} className="flex flex-col gap-6">
          <Field id="email" label={t("email")} hint={t("emailHint")}>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              aria-describedby="email-hint"
            />
          </Field>
          <Button type="submit" className="self-start">
            {t("submit")}
          </Button>
        </form>
        {passwordLoginSecret() && (
          <Link
            href={`/login/password${callbackUrl === "/trees" ? "" : `?callbackUrl=${encodeURIComponent(callbackUrl)}`}`}
            className="self-start"
          >
            {t("passwordLink")}
          </Link>
        )}
      </div>
    </div>
  );
}
