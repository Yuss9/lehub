import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "lehub — La maison, simplement",
    short_name: "lehub",
    description: "Ton foyer et tes courses à portée de main.",
    start_url: "/shopping",
    display: "standalone",
    lang: "fr",
    background_color: "#faf9f6",
    theme_color: "#417764",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
