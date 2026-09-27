// Client-safe theme constants (no server imports).
export const themes = ["light", "dim"] as const;
export type Theme = (typeof themes)[number];
export const defaultTheme: Theme = "light";
export const THEME_COOKIE = "SILSILAH_THEME";

/** Browser-bar colour per theme; matches --paper in globals.css. */
export const themeColor: Record<Theme, string> = { light: "#ffffff", dim: "#d6d3cc" };

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (themes as readonly string[]).includes(value);
}
