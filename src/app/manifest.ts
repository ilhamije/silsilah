import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Silsilah",
    short_name: "Silsilah",
    description: "Turn handwritten family trees into a family archive you can share.",
    start_url: "/trees",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#166534",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
