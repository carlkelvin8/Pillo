import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import type { ReactNode } from "react";
import { APP_NAME } from "@/config/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Clinic management for appointments, patient records and payments.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
