import type { ChipProps } from "@/components/ui/chip";
import type { AppointmentSource, AppointmentStatus } from "./schemas";

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const STATUS_TONE: Record<AppointmentStatus, NonNullable<ChipProps["tone"]>> = {
  scheduled: "pending",
  confirmed: "success",
  completed: "neutral",
  cancelled: "neutral",
  no_show: "danger",
};

export const SOURCE_LABEL: Record<AppointmentSource, string> = {
  staff: "Booked by staff",
  ai: "Booked by Dr. Pill",
  portal: "Booked by the patient",
};
