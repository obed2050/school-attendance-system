import { env } from "../config/env";

export interface AttendanceTimingResult {
  attendanceDate: Date;
  checkInTime: Date;
  status: "PRESENT" | "LATE";
  tooEarly: boolean;
}

export const SCHOOL_TIMEZONE = "Africa/Kigali";

function parseTime(value: string): number {
  const [hourStr, minuteStr] = value.split(":");
  const hours = parseInt(hourStr, 10);
  const minutes = parseInt(minuteStr, 10);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Invalid time value: "${value}" (expected HH:MM)`);
  }
  return hours * 60 + minutes;
}

export function timeToMinutes(value: string): number {
  return parseTime(value);
}

/**
 * Convert a calendar date (year, month, day in local time) into a Date whose
 * UTC components carry that same calendar date. Prisma maps `@db.Date`
 * columns using the UTC date components of the passed Date, so this keeps the
 * stored value independent of the server's timezone offset.
 */
export function utcCalendarDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/**
 * Parse a "YYYY-MM-DD" string into a Date whose UTC components carry that
 * calendar date. Used to query the `@db.Date` attendance_date column
 * consistently regardless of the server timezone.
 */
export function parseCalendarDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return utcCalendarDate(year, month - 1, day);
}

/**
 * Parse a "YYYY-MM-DD" string into a Date representing the very end of that
 * calendar day (UTC). Used for inclusive date-range upper bounds.
 */
export function parseCalendarDateEnd(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

export interface ZonedClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Read the clock components of `date` in the given timezone. School operations
 * use Africa/Kigali (UTC +2, no DST) so attendance records are date/time
 * consistent regardless of the host server timezone.
 */
export function getZonedClock(
  date: Date,
  timeZone: string = SCHOOL_TIMEZONE
): ZonedClock {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date);
  const part = (type: string): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : NaN;
  };
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute")
  };
}

/**
 * Compute the school calendar date (Africa/Kigali) for the given instant.
 * Used to derive "today" for the dashboard and attendance boundaries.
 */
export function getSchoolToday(date: Date = new Date()): Date {
  const clock = getZonedClock(date);
  return utcCalendarDate(clock.year, clock.month - 1, clock.day);
}

/**
 * Compute attendance date, check-in time and resulting status using the
 * school timezone (Africa/Kigali). Neither the date nor the time is taken
 * from the client. The late threshold and (optional) opening time come from
 * SchoolSettings. When no opening time is given, `tooEarly` is always false
 * (backwards compatible for callers that do not enforce one).
 */
export function buildAttendanceTiming(
  candidate: Date = new Date(),
  lateAfterTime: string = env.LATE_AFTER_TIME,
  attendanceStartTime?: string
): AttendanceTimingResult {
  const clock = getZonedClock(candidate);

  const attendanceDate = utcCalendarDate(clock.year, clock.month - 1, clock.day);
  const checkInTime = new Date(candidate);

  const nowMinutes = clock.hour * 60 + clock.minute;
  const lateAfterMinutes = timeToMinutes(lateAfterTime);

  const status: "PRESENT" | "LATE" =
    nowMinutes >= lateAfterMinutes ? "LATE" : "PRESENT";

  const tooEarly =
    attendanceStartTime !== undefined &&
    nowMinutes < timeToMinutes(attendanceStartTime);

  return { attendanceDate, checkInTime, status, tooEarly };
}