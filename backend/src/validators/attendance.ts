import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be in YYYY-MM-DD format");

/**
 * Attendance submission body. Coordinates/accuracy are optional at the schema
 * level so that a missing location yields the clear "location is required"
 * error from the service rather than a generic validation error. When present
 * they are strictly bounded, and any client fields the backend does not
 * recognize (e.g. is_inside_school) are silently discarded.
 */
export const attendanceSubmitSchema = z.object({
  latitude: z
    .number({ invalid_type_error: "latitude must be a number" })
    .min(-90, "latitude must be between -90 and 90")
    .max(90, "latitude must be between -90 and 90")
    .optional(),
  longitude: z
    .number({ invalid_type_error: "longitude must be a number" })
    .min(-180, "longitude must be between -180 and 180")
    .max(180, "longitude must be between -180 and 180")
    .optional(),
  accuracy: z
    .number({ invalid_type_error: "accuracy must be a number" })
    .positive("accuracy must be a positive number")
    .max(10000, "accuracy must be 10000 meters or less")
    .optional(),
  embedding: z
    .array(z.number().finite())
    .length(128, "face embedding must contain exactly 128 numbers")
    .refine(
      (values) => values.every((value) => Math.abs(value) <= 100),
      "embedding values are out of range"
    )
    .optional(),
  liveness: z.boolean().optional()
});

export type AttendanceSubmitBody = z.infer<typeof attendanceSubmitSchema>;

export const attendanceQuerySchema = z
  .object({
    date: dateSchema.optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    department: z.coerce.number().int().positive().optional(),
    status: z.enum(["PRESENT", "LATE"]).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
  })
  .refine(
    (data) => !(data.date && (data.dateFrom || data.dateTo)),
    { message: "Use either date OR dateFrom/dateTo, not both.", path: ["date"] }
  )
  .refine(
    (data) =>
      !data.dateFrom ||
      !data.dateTo ||
      new Date(data.dateFrom) <= new Date(data.dateTo),
    { message: "dateFrom must be on or before dateTo.", path: ["dateTo"] }
  );
