import { cookies } from "next/headers";
import { defaultTheme, isTheme, THEME_COOKIE, type Theme } from "./theme";

export async function getTheme(): Promise<Theme> {
  try {
    const value = (await cookies()).get(THEME_COOKIE)?.value;
    return isTheme(value) ? value : defaultTheme;
  } catch {
    // Called outside a request scope (scripts, tests).
    return defaultTheme;
  }
}
