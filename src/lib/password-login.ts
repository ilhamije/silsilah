import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Db } from "@/lib/db";

/*
 * Temporary password sign-in while email delivery is being set up.
 *
 * One shared password (PASSWORD_LOGIN_SECRET) works with any email address,
 * and a new address gets an account, like the magic link. That means anyone
 * who knows the password can sign in as any user, admins included: keep the
 * password private and remove this (unset the variable) once email works.
 *
 * Sessions are ordinary database sessions, the same ones the magic link
 * creates, so everything after sign-in behaves identically.
 */

export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // matches session.maxAge in src/auth.ts

export function passwordLoginSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.PASSWORD_LOGIN_SECRET ?? "";
  return secret.length > 0 ? secret : null;
}

/** Constant-time comparison; hashing first makes the lengths equal. */
export function passwordMatches(input: string, secret: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/** The Auth.js session cookie name: `__Secure-` prefixed on HTTPS, as Auth.js does. */
export function sessionCookieName(secure: boolean): string {
  return `${secure ? "__Secure-" : ""}authjs.session-token`;
}

/** Finds or creates the user and opens a database session for them. */
export async function createPasswordSession(db: Db, email: string, now = new Date()) {
  const user = await db.user.upsert({ where: { email }, update: {}, create: { email } });
  const expires = new Date(now.getTime() + SESSION_MAX_AGE * 1000);
  const session = await db.session.create({
    data: { sessionToken: randomUUID(), userId: user.id, expires },
  });
  return { token: session.sessionToken, expires };
}
