// Regenerates the PNG app icons from public/icons/icon.svg: `node scripts/generate-icons.mjs`
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const svg = await readFile("public/icons/icon.svg");
for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}
// Maskable: content inside the 80% safe zone on a full-bleed background.
const inner = await sharp(svg).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#166534" } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile("public/icons/maskable-512.png");
await sharp(svg).resize(180, 180).png().toFile("src/app/apple-icon.png");
await sharp(svg).resize(32, 32).png().toFile("src/app/icon.png");
console.log("icons written");
