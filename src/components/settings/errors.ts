/** A server error code as a sentence in the "settings" messages. */
export function settingsError(t: { (key: string): string; has(key: string): boolean }, code: string): string {
  return t.has(`error.${code}`) ? t(`error.${code}`) : t("error.generic");
}
