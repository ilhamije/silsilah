import "server-only";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notFound as notFoundError, unauthorized } from "@/lib/errors";
import { isAdminEmail } from "./admin";
import type { Permission } from "./roles";
import { assertTreePermission } from "./tree-access";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw unauthorized();
  return session.user;
}

export async function requireTreePermission(treeId: string, permission: Permission) {
  const user = await requireUser();
  return assertTreePermission(db, user.id, treeId, permission);
}

/** For pages: send signed-out visitors to /login and back here afterwards. */
export async function requireUserOrRedirect(returnTo: string) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
  }
  return session.user;
}

// Sign-in is magic-link only, so a session email is always a verified address.

/** For admin API routes. Non-admins get 404 so the admin area isn't advertised. */
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) throw notFoundError();
  return user;
}

/** For admin pages. */
export async function requireAdminOrRedirect(returnTo: string) {
  const user = await requireUserOrRedirect(returnTo);
  if (!isAdminEmail(user.email)) notFound();
  return user;
}
