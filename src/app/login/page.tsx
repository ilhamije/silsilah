import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { Button, Field, Input, Notice, PageHeader } from "@/components/ui";
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
    await signIn("resend", {
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      redirectTo: callbackUrl,
      redirect: false,
    });
    redirect("/login/check-email");
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={t("intro")} />
      <div className="flex flex-col gap-6 border-t border-rule pt-10">
        {callbackUrl.startsWith("/invite/") && <Notice>{t("inviteHint")}</Notice>}
        {params.error && (
          <Notice tone="notice" role="alert">
            {t("error")}
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
      </div>
    </div>
  );
}
