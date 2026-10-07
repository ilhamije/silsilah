"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz/session";
import { HttpError } from "@/lib/errors";
import type { Role } from "@/generated/prisma/enums";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { createInvitation, revokeInvitation } from "@/lib/sharing/invitations";
import { changeMemberRole, leaveTree, removeMember } from "@/lib/sharing/members";
import { deleteTree, updateTreeSettings } from "@/lib/trees";
import { inviteEmail } from "@/lib/email/templates";
import { idempotencyKeyFor, sendEmail } from "@/lib/email/send";
import type { Locale } from "@/i18n/config";

export type SettingsResult = { ok: true; link?: string; emailed?: boolean } | { ok: false; error: string };

async function run(fn: (userId: string) => Promise<Omit<Extract<SettingsResult, { ok: true }>, "ok"> | void>): Promise<SettingsResult> {
  try {
    const user = await requireUser();
    return { ok: true, ...(await fn(user.id)) };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.code };
    console.error(e);
    return { ok: false, error: "internal_error" };
  }
}

const str = (v: unknown) => String(v ?? "");

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Creates an invitation. The link is returned once and is never stored in
 * readable form. With an email address it is also sent; if sending fails the
 * link still comes back so the owner can share it another way.
 */
export async function inviteAction(treeId: string, input: unknown) {
  return run(async (userId) => {
    const { invitation, token } = await createInvitation(db, userId, str(treeId), input);
    const link = `${await origin()}/invite/${token}`;
    if (!invitation.email) return { link };
    const [tree, inviter, locale] = await Promise.all([
      db.familyTree.findUniqueOrThrow({ where: { id: invitation.treeId }, select: { name: true } }),
      db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }),
      getLocale(),
    ]);
    const mail = inviteEmail(link, tree.name, inviter.name ?? inviter.email, invitation.role, locale as Locale);
    try {
      await sendEmail({ to: invitation.email, ...mail, idempotencyKey: idempotencyKeyFor("invite", invitation.id) });
      return { link, emailed: true };
    } catch (e) {
      console.error("invite email failed", e instanceof Error ? e.name : e);
      return { link, emailed: false };
    }
  });
}

export async function revokeInviteAction(treeId: string, invitationId: string) {
  return run(async (userId) => {
    await revokeInvitation(db, userId, str(treeId), str(invitationId));
  });
}

export async function changeRoleAction(treeId: string, memberUserId: string, role: Role) {
  return run(async (userId) => {
    await changeMemberRole(db, userId, str(treeId), str(memberUserId), role);
  });
}

export async function removeMemberAction(treeId: string, memberUserId: string) {
  return run(async (userId) => {
    await removeMember(db, userId, str(treeId), str(memberUserId));
  });
}

export async function updatePrivacyAction(treeId: string, settings: { hideLivingFromViewers?: boolean; allowCrossFamilyMatch?: boolean }) {
  return run(async (userId) => {
    await updateTreeSettings(db, userId, str(treeId), {
      ...(typeof settings.hideLivingFromViewers === "boolean" ? { hideLivingFromViewers: settings.hideLivingFromViewers } : {}),
      ...(typeof settings.allowCrossFamilyMatch === "boolean" ? { allowCrossFamilyMatch: settings.allowCrossFamilyMatch } : {}),
    });
  });
}

export async function leaveTreeAction(treeId: string) {
  const res = await run(async (userId) => {
    await leaveTree(db, userId, str(treeId));
  });
  if (res.ok) redirect("/trees");
  return res;
}

/** The caller must type the tree's name, so a stray tap can't delete a family's history. */
export async function deleteTreeAction(treeId: string, typedName: string) {
  const res = await run(async (userId) => {
    // Permission first, so a non-member learns nothing (not even the name) from the answer.
    const access = await assertTreePermission(db, userId, str(treeId), "tree.delete");
    if (access.tree.name.trim() !== str(typedName).trim()) throw new HttpError(400, "name_mismatch");
    await deleteTree(db, userId, str(treeId));
  });
  if (res.ok) redirect("/trees");
  return res;
}
