import { SchoolSettings } from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { timeToMinutes } from "./attendanceTime";

const SINGLETON_KEY = "default";

export type UpdateSettingsInput = {
  school_name?: string;
  latitude?: number;
  longitude?: number;
  geofence_radius?: number;
  attendance_start_time?: string;
  late_after_time?: string;
};

const DEFAULT_SETTINGS = {
  schoolName: env.SCHOOL_NAME,
  latitude: env.SCHOOL_LATITUDE,
  longitude: env.SCHOOL_LONGITUDE,
  geofenceRadius: env.GEOFENCE_RADIUS,
  attendanceStartTime: env.ATTENDANCE_START_TIME,
  lateAfterTime: env.LATE_AFTER_TIME
};

/**
 * Return the single active SchoolSettings record, creating it from env
 * defaults the first time it is needed. The `singleton_key` unique column
 * guarantees only one settings record can ever exist.
 */
export async function getOrCreateSettings(): Promise<SchoolSettings> {
  return prisma.schoolSettings.upsert({
    where: { singletonKey: SINGLETON_KEY },
    update: {},
    create: { singletonKey: SINGLETON_KEY, ...DEFAULT_SETTINGS }
  });
}

/**
 * Idempotent seed entry point: refresh the settings record with the current
 * env defaults. Running it twice still leaves exactly one record.
 */
export async function seedSchoolSettings(): Promise<SchoolSettings> {
  return prisma.schoolSettings.upsert({
    where: { singletonKey: SINGLETON_KEY },
    update: DEFAULT_SETTINGS,
    create: { singletonKey: SINGLETON_KEY, ...DEFAULT_SETTINGS }
  });
}

export async function updateSettings(input: UpdateSettingsInput): Promise<SchoolSettings> {
  const existing = await getOrCreateSettings();

  const nextStartTime = input.attendance_start_time ?? existing.attendanceStartTime;
  const nextLateAfterTime = input.late_after_time ?? existing.lateAfterTime;
  if (timeToMinutes(nextLateAfterTime) < timeToMinutes(nextStartTime)) {
    throw new ApiError(
      422,
      "late_after_time cannot be earlier than attendance_start_time"
    );
  }

  return prisma.schoolSettings.update({
    where: { id: existing.id },
    data: {
      schoolName: input.school_name ?? existing.schoolName,
      latitude: input.latitude ?? existing.latitude,
      longitude: input.longitude ?? existing.longitude,
      geofenceRadius: input.geofence_radius ?? existing.geofenceRadius,
      attendanceStartTime: input.attendance_start_time ?? existing.attendanceStartTime,
      lateAfterTime: input.late_after_time ?? existing.lateAfterTime
    }
  });
}