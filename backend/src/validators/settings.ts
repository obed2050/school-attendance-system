import { z } from "zod";

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be in 24-hour HH:MM format");

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export const updateSettingsSchema = z
  .object({
    school_name: z.string().trim().min(1).max(200).optional(),
    latitude: z.number().min(-90, "latitude must be between -90 and 90").max(90).optional(),
    longitude: z
      .number()
      .min(-180, "longitude must be between -180 and 180")
      .max(180)
      .optional(),
    geofence_radius: z
      .number()
      .int()
      .min(10, "geofence_radius must be between 10 and 1000 meters")
      .max(1000)
      .optional(),
    attendance_start_time: timeSchema.optional(),
    late_after_time: timeSchema.optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one setting must be provided",
    path: []
  })
  .refine(
    (data) =>
      !(
        data.attendance_start_time &&
        data.late_after_time &&
        toMinutes(data.late_after_time) < toMinutes(data.attendance_start_time)
      ),
    {
      message: "late_after_time cannot be earlier than attendance_start_time",
      path: ["late_after_time"]
    }
  );

export type UpdateSettingsBody = z.infer<typeof updateSettingsSchema>;