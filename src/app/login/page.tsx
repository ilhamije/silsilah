import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { Button, Input } from "@/components/ui";
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
    <div className="mx-auto flex max-w-md flex-col gap-4 pt-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {callbackUrl.startsWith("/invite/") && <p className="rounded-xl bg-brand-soft p-3">{t("inviteHint")}</p>}
      <p className="text-muted">{t("intro")}</p>
      {params.error && (
        <p role="alert" className="rounded-xl bg-warn-soft p-3 text-warn">
          {t("error")}
        </p>
      )}
      <form action={sendLink} className="flex flex-col gap-3">
        <label htmlFor="email" className="font-medium">
          {t("email")}
        </label>
        <Input id="email" name="email" type="email" required autoComplete="email" inputMode="email" autoFocus />
        <Button type="submit">{t("submit")}</Button>
      </form>
    </div>
  );
}
