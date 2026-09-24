import type { MetadataRoute } from "next";

// Lets players add the league to their phone's home screen and open it like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Survivor Fantasy League",
    short_name: "Survivor FL",
    description: "Standings, rosters, weekly pick order and season history for the Survivor fantasy league.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1210",
    theme_color: "#0b1210",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
