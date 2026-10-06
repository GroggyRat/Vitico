import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VITICO Wholesale",
    short_name: "VITICO",
    description: "Wholesale ordering for VITICO customers across Fiji and the Pacific.",
    start_url: "/portal",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f766a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
