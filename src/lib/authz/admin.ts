/**
 * Super admins are listed in the ADMIN_EMAILS environment variable
 * (comma-separated). It is the only source of truth: there is no admin flag in
 * the database, so admin rights can't be granted through the app and are
 * revoked by removing the address and redeploying.
 *
 * Admins see app-wide statistics and tuning data. Admin rights do NOT grant
 * access to anyone's family trees; tree access still requires membership.
 */
export function parseAdminEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
}

export function isAdminEmail(
  email: string | null | undefined,
  adminEmails: Set<string> = parseAdminEmails(process.env.ADMIN_EMAILS),
): boolean {
  return !!email && adminEmails.has(email.trim().toLowerCase());
}
