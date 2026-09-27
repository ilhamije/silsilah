import { Google_Sans_Flex, Inter } from "next/font/google";

// Self-hosted by next/font at build time: no request to Google from visitors.

/** Headings and display text. Variable font; opsz and wdth give the wide, heavy headline cut. */
export const display = Google_Sans_Flex({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "wdth"],
  display: "swap",
  variable: "--font-google-sans-flex",
});

/** Body, navigation and data. Variable font, so all weights come in one file. */
export const sans = Inter({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-inter",
});
