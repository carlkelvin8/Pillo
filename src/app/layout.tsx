import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import type { ReactNode } from "react";
import { APP_NAME } from "@/config/brand";
import { PWA_THEME } from "@/features/marketing/pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Clinic management for appointments, patient records and payments.",
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: PWA_THEME,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* Browser extensions such as Grammarly add data attributes before hydration. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
