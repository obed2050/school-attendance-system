import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_URL_TEST: z.string().optional(),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  FRONTEND_URL: z.string().optional(),
  SCHOOL_NAME: z.string().default("My School"),
  SCHOOL_LATITUDE: z.coerce.number().min(-90).max(90).default(-1.9441),
  SCHOOL_LONGITUDE: z.coerce.number().min(-180).max(180).default(30.0619),
  GEOFENCE_RADIUS: z.coerce.number().int().min(10).max(1000).default(100),
  ATTENDANCE_START_TIME: z.string().default("07:30"),
  LATE_AFTER_TIME: z.string().default("08:00"),
  FACE_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.55),
  FACE_ENCRYPTION_KEY: z.string().optional(),
  ADMIN_NAME: z.string().default("System Administrator"),
  ADMIN_EMAIL: z.string().email().default("admin@school.com"),
  ADMIN_PASSWORD: z.string().default("")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
