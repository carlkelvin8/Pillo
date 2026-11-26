import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

const coordinate = (limit: number, label: string) => {
  const message = `Enter a ${label} between ${-limit} and ${limit}.`;
  return z
    .string()
    .trim()
    .regex(/^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+))?$/, message)
    .transform((value) => (value === "" ? null : Number(value)))
    .pipe(z.number().min(-limit, message).max(limit, message).nullable())
    .transform((value) => (value === null ? null : Number(value.toFixed(6))))
    .optional();
};

const coordinateFields = {
  latitude: coordinate(90, "latitude"),
  longitude: coordinate(180, "longitude"),
};

export const branchCoordinatesSchema = z.object(coordinateFields).superRefine((point, ctx) => {
  if ((point.latitude == null) !== (point.longitude == null)) {
    ctx.addIssue({
      code: "custom",
      path: [point.latitude == null ? "latitude" : "longitude"],
      message: "Enter both coordinates or clear the pin.",
    });
  }
});

export const branchFormSchema = branchCoordinatesSchema.safeExtend({
  name: z.string().trim().min(1, "Enter the branch name.").max(120),
  address: optionalText(300),
  phone: optionalText(40),
});

export const doctorFormSchema = z.object({
  displayName: z.string().trim().min(1, "Enter the doctor's name.").max(120),
  specialty: optionalText(120),
});

export const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
] as const;

const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM.");

/** One day's hours as submitted: open flag plus opening and closing time. */
export const dayHoursSchema = z
  .object({ weekday: z.number().int().min(0).max(6), open: z.boolean(), opens: time, closes: time })
  .refine((d) => !d.open || d.closes > d.opens, {
    path: ["closes"],
    message: "Closing time must be after opening time.",
  });

export const hoursFormSchema = z.object({
  branchId: z.uuid(),
  days: z.array(dayHoursSchema).length(7),
});

export const doctorHoursFormSchema = z
  .object({
    doctorId: z.uuid(),
    branchId: z.uuid(),
    weekday: z.coerce.number().int().min(0).max(6),
    startsAt: time,
    endsAt: time,
    windowId: z
      .string()
      .optional()
      .transform((value) => value || undefined),
  })
  .refine((window) => window.endsAt > window.startsAt, {
    path: ["endsAt"],
    message: "End time must be after start time.",
  });
