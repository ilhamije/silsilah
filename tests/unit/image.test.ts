import { expect, it } from "vitest";
import { fitWithin, isHeic } from "@/client/image";

it.each([
  [4032, 3024, { width: 2000, height: 1500 }],
  [3024, 4032, { width: 1500, height: 2000 }],
  [1200, 800, { width: 1200, height: 800 }], // never upscales
  [2000, 2000, { width: 2000, height: 2000 }],
])("fitWithin(%i, %i)", (w, h, expected) => {
  expect(fitWithin(w, h)).toEqual(expected);
});

it("detects HEIC by type or extension", () => {
  expect(isHeic(new File([], "IMG_1.HEIC"))).toBe(true);
  expect(isHeic(new File([], "a", { type: "image/heif" }))).toBe(true);
  expect(isHeic(new File([], "a.jpg", { type: "image/jpeg" }))).toBe(false);
});
