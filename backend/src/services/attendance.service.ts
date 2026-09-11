import { AttendanceStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import {
  buildAttendanceTiming,
  getSchoolToday,
  parseCalendarDate,
  parseCalendarDateEnd
} from "./attendanceTime";
import { getOrCreateSettings } from "./settings.service";
import { findDeviceForUser } from "./device.service";
import { verifyLocation, LocationInput, LocationVerificationResult } from "./geofence.service";
import {
  cosineSimilarity,
  decryptEmbedding,
  faceMatches,
  isPlausibleEmbedding,
  IDENTITY_VERIFICATION_FAILED
} from "./biometric.service";
import { logSecurityEvent } from "./securityEvent.service";

export interface AdminAttendanceQuery {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  department?: number;
  status?: "PRESENT" | "LATE";
  search?: string;
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type AttendanceExportQuery = Pick<
  AdminAttendanceQuery,
  "date" | "dateFrom" | "dateTo" | "department" | "status" | "search"
>;

function getStatusValue(status?: string): AttendanceStatus | undefined {
  if (status === "PRESENT") return AttendanceStatus.PRESENT;
  if (status === "LATE") return AttendanceStatus.LATE;
  return undefined;
}

/**
 * Shared attendance filter builder used by the dashboard list so that
 * filtering logic is not duplicated.
 */
export function buildAttendanceWhere(
  filters: Pick<
    AdminAttendanceQuery,
    "date" | "dateFrom" | "dateTo" | "department" | "status" | "search"
  >
): Prisma.AttendanceWhereInput {
  const where: Prisma.AttendanceWhereInput = {};
  const userFilter: Prisma.UserWhereInput = {};

  if (filters.department) {
    userFilter.departmentId = filters.department;
  }

  if (filters.search) {
    const term = filters.search;
    userFilter.OR = [
      { fullName: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
      { phoneNumber: { contains: term, mode: "insensitive" } }
    ];
  }

  if (Object.keys(userFilter).length > 0) {
    where.user = userFilter;
  }

  const status = getStatusValue(filters.status);
  if (status) {
    where.status = status;
  }

  if (filters.date) {
    where.attendanceDate = parseCalendarDate(filters.date);
  } else if (filters.dateFrom || filters.dateTo) {
    const gte = filters.dateFrom ? parseCalendarDate(filters.dateFrom) : undefined;
    const lte = filters.dateTo ? parseCalendarDateEnd(filters.dateTo) : undefined;
    where.attendanceDate = { gte, lte };
  }

  return where;
}

export interface StaffAttendanceResult {
  id: number;
  attendanceDate: Date;
  checkInTime: Date;
  status: AttendanceStatus;
  submitted: boolean;
}

export interface SubmitAttendanceOptions {
  deviceToken?: string;
  location?: LocationInput;
  embedding?: number[];
  liveness?: boolean;
  now?: Date;
}

/**
 * Record attendance for the authenticated staff member.
 *
 * The full security chain is enforced here:
 *   auth => account status => face reference present => GPS geofence =>
 *   attendance time => no existing record today => device => live face match =>
 *   transaction + unique constraint => create.
 *
 * The browser location is only evidence, never trusted. Face verification is a
 * server-side comparison of the 128-d embedding produced on the device against
 * the encrypted stored reference; the daily capture itself is never uploaded
 * and never persisted, so it cannot be retained after the check.
 */
export async function submitAttendance(
  userId: number,
  options: SubmitAttendanceOptions = {}
): Promise<StaffAttendanceResult> {
  const now = options.now ?? new Date();

  const [user, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        faceReference: true,
        faceReferenceStatus: true
      }
    }),
    getOrCreateSettings()
  ]);

  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "Only active staff can submit attendance");
  }
  if (user.faceReferenceStatus !== "REGISTERED" || !user.faceReference) {
    await logSecurityEvent({
      userId,
      eventType: "FACE_REFERENCE_MISSING",
      message: "Attendance attempted without a reference face"
    });
    throw new ApiError(
      403,
      "Facial verification profile not set up. Set it up before checking in."
    );
  }

  const location = options.location;
  if (
    !location ||
    typeof location.latitude !== "number" ||
    typeof location.longitude !== "number" ||
    typeof location.accuracy !== "number"
  ) {
    throw new ApiError(400, "Location permission is required for attendance.");
  }

  const locationResult = verifyLocation(
    location,
    settings.latitude,
    settings.longitude,
    settings.geofenceRadius
  );

  if (!locationResult.verified) {
    if (locationResult.reason === "outside") {
      await logSecurityEvent({
        userId,
        eventType: "GPS_FAILED",
        message: "Attendance attempted outside the school geofence"
      });
      throw new ApiError(
        400,
        "Attendance can only be submitted on school premises."
      );
    }
    throw new ApiError(
      400,
      "Your location could not be verified. Please move to an open area and try again."
    );
  }

  const timing = buildAttendanceTiming(
    now,
    settings.lateAfterTime,
    settings.attendanceStartTime
  );
  if (timing.tooEarly) {
    throw new ApiError(400, "Attendance has not started yet.");
  }

  const existing = await prisma.attendance.findUnique({
    where: {
      userId_attendanceDate: {
        userId,
        attendanceDate: timing.attendanceDate
      }
    }
  });

  if (existing) {
    await logSecurityEvent({
      userId,
      eventType: "DUPLICATE_ATTENDANCE",
      message: "Duplicate attendance submission rejected"
    });
    throw new ApiError(409, "Attendance has already been recorded for today.");
  }

  let deviceVerified = false;
  let deviceId: number | null = null;

  if (options.deviceToken) {
    const device = await findDeviceForUser(userId, options.deviceToken);
    if (device?.status === "REVOKED") {
      await logSecurityEvent({
        userId,
        eventType: "DEVICE_REVOKED",
        message: "Attendance attempted with a revoked device"
      });
      throw new ApiError(
        403,
        "This device has been revoked. Confirm your identity again to register a new device."
      );
    }
    if (device) {
      deviceId = device.id;
      deviceVerified = device.status === "ACTIVE";
    }
  }

  if (!isPlausibleEmbedding(options.embedding)) {
    throw new ApiError(400, "Identity verification is required for attendance.");
  }

  const livenessVerified = options.liveness === true;
  if (!livenessVerified) {
    await logSecurityEvent({
      userId,
      eventType: "LIVENESS_FAILED",
      message: "Attendance denied: liveness not confirmed"
    });
    throw new ApiError(403, IDENTITY_VERIFICATION_FAILED);
  }

  const reference = decryptEmbedding(user.faceReference);
  const similarity = cosineSimilarity(options.embedding, reference);
  if (!faceMatches(similarity)) {
    await logSecurityEvent({
      userId,
      eventType: "FACE_VERIFICATION_FAILED",
      message: "Attendance denied: face did not match the reference"
    });
    throw new ApiError(403, IDENTITY_VERIFICATION_FAILED);
  }

  try {
    const { record, activatedDevice } = await prisma.$transaction(async (tx) => {
      let finalDeviceVerified = deviceVerified;
      let activated = false;
      if (deviceId && deviceVerified) {
        await tx.device.updateMany({
          where: { id: deviceId, userId, status: "ACTIVE" },
          data: { lastUsedAt: now }
        });
      } else if (deviceId && options.deviceToken) {
        // PENDING (provisioned) device: a successful live face match is the
        // controlled registration - the device becomes ACTIVE now.
        const result = await tx.device.updateMany({
          where: { id: deviceId, userId, status: "PENDING" },
          data: { status: "ACTIVE", lastUsedAt: now }
        });
        activated = result.count > 0;
        if (activated) {
          finalDeviceVerified = true;
        }
      }

      const created = await tx.attendance.create({
        data: {
          userId,
          attendanceDate: timing.attendanceDate,
          checkInTime: timing.checkInTime,
          status: timing.status,
          locationVerified: true,
          locationVerifiedAt: now,
          locationVerificationResult: "PASS",
          faceVerified: true,
          livenessVerified: true,
          deviceVerified: finalDeviceVerified,
          deviceId: deviceId ?? undefined,
          verificationStatus: "VERIFIED",
          qrVerified: true
        }
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          lastAttendanceAt: timing.checkInTime,
          lastAttendanceDeviceId: deviceId ?? undefined,
          lastAttendanceVerificationAt: now
        }
      });

      return { record: created, activatedDevice: activated };
    });

    if (deviceId) {
      await logSecurityEvent({
        userId,
        eventType: activatedDevice ? "DEVICE_REGISTERED" : "DEVICE_USED",
        message: "Device associated with successful attendance"
      });
    }
    await logSecurityEvent({
      userId,
      eventType: "ATTENDANCE_CREATED",
      message: "Attendance recorded for the school day"
    });

    return {
      id: record.id,
      attendanceDate: record.attendanceDate,
      checkInTime: record.checkInTime,
      status: record.status,
      submitted: true
    };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      await logSecurityEvent({
        userId,
        eventType: "DUPLICATE_ATTENDANCE",
        message: "Concurrent duplicate attendance rejected by unique constraint"
      });
      throw new ApiError(409, "Attendance has already been recorded for today.");
    }
    throw err;
  }
}

/**
 * Read-only geofence pre-check for the "Verify my location" step. It runs the
 * exact same rules the submission flow enforces, but never records attendance
 * and never weakens the server-side check at submission time.
 */
export async function precheckLocation(
  location: LocationInput
): Promise<LocationVerificationResult> {
  const settings = await getOrCreateSettings();
  return verifyLocation(
    location,
    settings.latitude,
    settings.longitude,
    settings.geofenceRadius
  );
}

export async function getMyAttendance(userId: number) {
  const records = await prisma.attendance.findMany({
    where: { userId },
    orderBy: { attendanceDate: "desc" },
    select: {
      id: true,
      attendanceDate: true,
      checkInTime: true,
      status: true,
      createdAt: true
    }
  });
  return records;
}

export const attendanceRecordSelect = Prisma.validator<Prisma.AttendanceSelect>()({
  id: true,
  attendanceDate: true,
  checkInTime: true,
  status: true,
  verificationStatus: true,
  user: {
    select: {
      fullName: true,
      email: true,
      phoneNumber: true,
      department: { select: { name: true } }
    }
  }
});

export async function listAdminAttendance(
  query: AdminAttendanceQuery
): Promise<PaginatedResult<unknown>> {
  const where = buildAttendanceWhere(query);

  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      skip,
      take: limit,
      orderBy: { attendanceDate: "desc" },
      select: attendanceRecordSelect
    }),
    prisma.attendance.count({ where })
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Fetch ALL attendance records matching the filters (no pagination).
 * Used by the PDF / Excel report exporters.
 */
export async function getAttendanceRecordsForExport(
  query: AttendanceExportQuery
): Promise<unknown[]> {
  const where = buildAttendanceWhere({
    date: query.date,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    department: query.department,
    status: query.status,
    search: query.search
  });

  return prisma.attendance.findMany({
    where,
    orderBy: { attendanceDate: "desc" },
    select: attendanceRecordSelect
  });
}

export interface DashboardStats {
  date: string;
  total_staff: number;
  present: number;
  late: number;
  absent: number;
}

export async function getDashboardStats(
  dateStr?: string
): Promise<DashboardStats> {
  const attendanceDate = dateStr
    ? parseCalendarDate(dateStr)
    : getSchoolToday();

  const whereActiveStaff: Prisma.UserWhereInput = {
    role: "STAFF",
    status: "ACTIVE"
  };

  const [totalStaff, presentCount, lateCount] = await Promise.all([
    prisma.user.count({ where: whereActiveStaff }),
    prisma.attendance.count({
      where: {
        attendanceDate,
        status: "PRESENT",
        user: whereActiveStaff
      }
    }),
    prisma.attendance.count({
      where: {
        attendanceDate,
        status: "LATE",
        user: whereActiveStaff
      }
    })
  ]);

  const present = presentCount + lateCount;
  const absent = totalStaff - present;

  return {
    date: attendanceDate.toISOString().slice(0, 10),
    total_staff: totalStaff,
    present,
    late: lateCount,
    absent: absent < 0 ? 0 : absent
  };
}
