import type { MetadataRoute } from "next";
import { APP_NAME } from "@/config/brand";
import { PWA_BACKGROUND, PWA_THEME } from "@/features/marketing/pwa";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} clinic`,
    short_name: APP_NAME,
    description: "Appointments, patient records and payment records for your clinic.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: PWA_BACKGROUND,
    theme_color: PWA_THEME,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
