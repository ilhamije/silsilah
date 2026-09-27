import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";

// Self-hosted by next/font at build time: no request to Google from visitors.

/** Headings. Instrument Serif ships a single regular weight, plus italics for storytelling. */
export const serif = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument-serif",
});

/** Body, navigation and data. Variable font, so all weights come in one file. */
export const sans = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-plus-jakarta",
});
