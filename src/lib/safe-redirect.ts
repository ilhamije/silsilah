/** Only same-origin relative paths; blocks "//evil.com" and "/\evil.com". */
export function safeRedirect(target: unknown, fallback = "/trees"): string {
  if (typeof target !== "string") return fallback;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return fallback;
  return target;
}
