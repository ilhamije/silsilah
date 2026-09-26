import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { acceptInvitation, inspectInvitation } from "@/lib/sharing/invitations";
import { Button, buttonClass, Card } from "@/components/ui";

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;
  const [session, t, info] = await Promise.all([auth(), getTranslations(), inspectInvitation(db, token)]);

  if (info.state !== "valid") {
    return (
      <Card className="mx-auto max-w-md">
        <h1 className="mb-2 text-xl font-bold">{t("invite.title")}</h1>
        <p role="alert">{t(`invite.${info.state}`)}</p>
      </Card>
    );
  }

  async function accept() {
    "use server";
    const current = await auth();
    if (!current?.user?.id || !current.user.email) redirect(`/login?callbackUrl=/invite/${token}`);
    try {
      await acceptInvitation(db, { id: current.user.id, email: current.user.email }, token);
    } catch (e) {
      if (e instanceof HttpError && e.code === "invitation_email_mismatch") {
        redirect(`/invite/${token}?error=email_mismatch`);
      }
      throw e;
    }
    redirect(`/trees/${info.invitation!.treeId}`);
  }

  return (
    <Card className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-bold">{t("invite.title")}</h1>
      <p>
        {t("invite.body", {
          tree: info.invitation.tree.name,
          role: t(`roles.${info.invitation.role}`),
        })}
      </p>
      {error === "email_mismatch" && (
        <p role="alert" className="rounded-xl bg-warn-soft p-3 text-warn">
          {t("invite.email_mismatch")}
        </p>
      )}
      {session ? (
        <form action={accept}>
          <Button type="submit" className="w-full">
            {t("invite.accept")}
          </Button>
        </form>
      ) : (
        <Link href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`} className={buttonClass()}>
          {t("invite.signInFirst")}
        </Link>
      )}
    </Card>
  );
}
