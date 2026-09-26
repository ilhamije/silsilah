/**
 * Pulls a 4-digit year out of a free-form, possibly partial date as written
 * on a family tree: "1952", "~1950", "ca. 1890", "12-5-1931", "Mei 1931",
 * "1950an". Two-digit years ("12-5-31") are ambiguous and return null.
 */
export function parseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1000 && year <= 2100 ? year : null;
}
