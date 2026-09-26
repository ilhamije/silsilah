import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { unauthorized } from "@/lib/errors";
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
