import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { acceptInvitation, inspectInvitation } from "@/lib/sharing/invitations";
import { Button, buttonClass, Notice, PageHeader } from "@/components/ui";

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;
  const [session, t, info] = await Promise.all([auth(), getTranslations(), inspectInvitation(db, token)]);

  if (info.state !== "valid") {
    return (
      <div className="mx-auto flex max-w-xl flex-col">
        <PageHeader eyebrow={t("invite.eyebrow")} title={t("invite.title")} />
        <Notice tone="notice" role="alert">
          {t(`invite.${info.state}`)}
        </Notice>
      </div>
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
    <div className="mx-auto flex max-w-xl flex-col">
      <PageHeader
        eyebrow={t("invite.eyebrow")}
        title={
          <>
            {t("invite.titleLead")} <em className="italic">{info.invitation.tree.name}</em>
          </>
        }
        lede={t("invite.body", { role: t(`roles.${info.invitation.role}`) })}
      />
      <div className="flex flex-col gap-6 border-t border-rule pt-10">
        {error === "email_mismatch" && (
          <Notice tone="notice" role="alert">
            {t("invite.email_mismatch")}
          </Notice>
        )}
        {session ? (
          <form action={accept}>
            <Button type="submit">{t("invite.accept")}</Button>
          </form>
        ) : (
          <Link href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`} className={buttonClass("primary", "self-start")}>
            {t("invite.signInFirst")}
          </Link>
        )}
      </div>
    </div>
  );
}
