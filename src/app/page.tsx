import type { Metadata } from "next";
import { APP_NAME } from "@/config/brand";
import { Landing } from "@/features/marketing/landing";

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME} · Clinic management and AI front desk` },
  description:
    "Appointments, patient records, payment records and a supervised AI front desk for Philippine clinics.",
};

export default function HomePage() {
  return <Landing />;
}
