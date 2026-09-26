import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { hasRole } from "@/lib/authz/roles";
import { logActivity } from "@/lib/activity";
import { badRequest, HttpError, notFound } from "@/lib/errors";

export const INVITE_DEFAULT_DAYS = 7;
export const INVITE_MAX_DAYS = 30;

export const invitationInputSchema = z.object({
  email: z.email().trim().toLowerCase().nullish(),
  role: z.enum(["OWNER", "EDITOR", "VIEWER"]),
  singleUse: z.boolean().default(true),
  expiresInDays: z.number().int().min(1).max(INVITE_MAX_DAYS).default(INVITE_DEFAULT_DAYS),
});

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Returns the raw token exactly once; only its hash is stored. The caller
 * builds `/invite/<token>` and emails it (email invites) or shows it (links).
 */
export async function createInvitation(db: Db, userId: string, treeId: string, input: unknown) {
  await assertTreePermission(db, userId, treeId, "invite.manage");
  const parsed = invitationInputSchema.safeParse(input);
  if (!parsed.success) throw badRequest("invalid_invitation", parsed.error.issues);
  const { email, role, singleUse, expiresInDays } = parsed.data;
  // Shareable links can be forwarded anywhere, so they never grant ownership.
  if (!email && role === "OWNER") throw badRequest("owner_link_not_allowed");

  const token = randomBytes(32).toString("base64url");
  return db.$transaction(async (tx) => {
    const invitation = await tx.invitation.create({
      data: {
        treeId,
        email: email ?? null,
        role,
        // An email invite is always for one person.
        singleUse: email ? true : singleUse,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
        createdById: userId,
      },
    });
    await logActivity(tx, {
      treeId,
      userId,
      action: "invited",
      entityType: "invitation",
      entityId: invitation.id,
      after: { email: invitation.email, role, singleUse: invitation.singleUse },
    });
    return { invitation, token };
  });
}

export async function revokeInvitation(db: Db, userId: string, treeId: string, invitationId: string) {
  await assertTreePermission(db, userId, treeId, "invite.manage");
  const invitation = await db.invitation.findFirst({ where: { id: invitationId, treeId } });
  if (!invitation) throw notFound("invitation_not_found");
  if (invitation.revokedAt) return invitation;
  return db.$transaction(async (tx) => {
    const revoked = await tx.invitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });
    await logActivity(tx, {
      treeId,
      userId,
      action: "revoked",
      entityType: "invitation",
      entityId: invitationId,
    });
    return revoked;
  });
}

export type InvitationState = "valid" | "expired" | "revoked" | "used" | "not_found";

/** Public preview for the invite landing page (works before sign-in). */
export async function inspectInvitation(db: Db, token: string, now = new Date()) {
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { tree: { select: { id: true, name: true } } },
  });
  if (!invitation) return { state: "not_found" as const };
  const state: InvitationState = invitation.revokedAt
    ? "revoked"
    : invitation.expiresAt <= now
      ? "expired"
      : invitation.singleUse && invitation.useCount > 0
        ? "used"
        : "valid";
  return { state, invitation };
}

/**
 * Joins the signed-in user to the tree. Existing members keep the higher of
 * their current role and the invited one.
 */
export async function acceptInvitation(
  db: Db,
  user: { id: string; email: string },
  token: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitation) throw notFound("invitation_not_found");
    if (invitation.revokedAt) throw new HttpError(410, "invitation_revoked");
    if (invitation.expiresAt <= now) throw new HttpError(410, "invitation_expired");
    if (invitation.email && invitation.email !== user.email.toLowerCase()) {
      throw new HttpError(403, "invitation_email_mismatch");
    }

    // Atomic claim so two people can't both use a single-use link.
    const { count } = await tx.invitation.updateMany({
      where: {
        id: invitation.id,
        revokedAt: null,
        ...(invitation.singleUse ? { useCount: 0 } : {}),
      },
      data: { useCount: { increment: 1 } },
    });
    if (count === 0) throw new HttpError(410, "invitation_used");

    const key = { treeId_userId: { treeId: invitation.treeId, userId: user.id } };
    const existing = await tx.treeMember.findUnique({ where: key });
    if (existing && hasRole(existing.role, invitation.role)) return existing;

    const member = existing
      ? await tx.treeMember.update({ where: key, data: { role: invitation.role } })
      : await tx.treeMember.create({
          data: { treeId: invitation.treeId, userId: user.id, role: invitation.role },
        });
    await logActivity(tx, {
      treeId: invitation.treeId,
      userId: user.id,
      action: "joined",
      entityType: "member",
      entityId: user.id,
      after: { role: member.role, invitationId: invitation.id },
    });
    return member;
  });
}
