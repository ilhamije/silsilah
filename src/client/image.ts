/*
 * Browser-only image helpers. Photos are prepared on the phone so that only a
 * small JPEG (about 2000px on the long edge, 80% quality) ever leaves it.
 */

export const MAX_EDGE = 2000;
export const JPEG_QUALITY = 0.8;
/** Refuse absurdly large source files before trying to decode them. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

export type PreparedImage = { blob: Blob; width: number; height: number };

export class ImagePrepError extends Error {
  constructor(public code: "too_large" | "not_an_image" | "heic_failed" | "decode_failed") {
    super(code);
  }
}

/** Scale (w, h) down so the long edge is at most `max`; never scales up. */
export function fitWithin(w: number, h: number, max = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

export function isHeic(file: File) {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

/**
 * Decodes via <img>, which applies the EXIF orientation in every current
 * browser, so photos come out the right way up without parsing EXIF ourselves.
 */
async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new ImagePrepError("decode_failed");
  } finally {
    // The decoded bitmap stays usable after the URL is revoked.
    URL.revokeObjectURL(url);
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImagePrepError("decode_failed"))), "image/jpeg", JPEG_QUALITY),
  );
}

function draw(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): Promise<PreparedImage> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImagePrepError("decode_failed");
  ctx.fillStyle = "#ffffff"; // transparent PNGs become white paper, not black
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  paint(ctx);
  return canvasToJpeg(canvas).then((blob) => ({ blob, width, height }));
}

/** File from the camera or gallery → upright, resized JPEG. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.size > MAX_SOURCE_BYTES) throw new ImagePrepError("too_large");
  let source: Blob = file;
  if (isHeic(file)) {
    try {
      const heic2any = (await import("heic2any")).default;
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      source = Array.isArray(out) ? out[0] : out;
    } catch {
      throw new ImagePrepError("heic_failed");
    }
  } else if (!file.type.startsWith("image/")) {
    throw new ImagePrepError("not_an_image");
  }
  const img = await loadImage(source);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
  return draw(width, height, (ctx) => ctx.drawImage(img, 0, 0, width, height));
}

/** Rotate by 90° clockwise `quarterTurns` times. */
export async function rotateImage(blob: Blob, quarterTurns = 1): Promise<PreparedImage> {
  const img = await loadImage(blob);
  const turns = ((quarterTurns % 4) + 4) % 4;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const [width, height] = turns % 2 ? [h, w] : [w, h];
  return draw(width, height, (ctx) => {
    ctx.translate(width / 2, height / 2);
    ctx.rotate((turns * Math.PI) / 2);
    ctx.drawImage(img, -w / 2, -h / 2);
  });
}

/** Crop to a rectangle given as fractions (0..1) of the image. */
export async function cropImage(
  blob: Blob,
  crop: { x: number; y: number; width: number; height: number },
): Promise<PreparedImage> {
  const img = await loadImage(blob);
  const sx = Math.round(crop.x * img.naturalWidth);
  const sy = Math.round(crop.y * img.naturalHeight);
  const sw = Math.max(1, Math.round(crop.width * img.naturalWidth));
  const sh = Math.max(1, Math.round(crop.height * img.naturalHeight));
  return draw(sw, sh, (ctx) => ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh));
}
