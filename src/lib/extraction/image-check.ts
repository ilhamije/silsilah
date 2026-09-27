import type { PageImage } from "./service";

/**
 * The browser compresses photos to about 2000px / JPEG 80% (typically
 * 0.3–1 MB). This cap is well above that and below Vercel's 4.5 MB request
 * body limit.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Identify the format from the file's first bytes; the declared type isn't trusted. */
export function sniffImageType(bytes: Uint8Array): PageImage["mediaType"] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return "image/png";
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
