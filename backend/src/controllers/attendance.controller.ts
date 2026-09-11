import { Response } from "express";
import {
  submitAttendance,
  getMyAttendance,
  precheckLocation
} from "../services/attendance.service";
import {
  DEVICE_COOKIE_NAME,
  findDeviceForUser,
  provisionDevice
} from "../services/device.service";
import { AttendanceSubmitBody, LocationPrecheckBody } from "../validators/attendance";
import { success } from "../utils/apiResponse";
import { catchAsync } from "../utils/catchAsync";

function getDeviceTokenFromRequest(req: {
  cookies: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  const cookie = req.cookies?.[DEVICE_COOKIE_NAME];
  if (typeof cookie === "string" && cookie.length > 0) return cookie;
  const header = req.headers["x-device-token"];
  return typeof header === "string" ? header : undefined;
}

export const submitAttendanceHandler = catchAsync(async (req, res: Response) => {
  const deviceToken = getDeviceTokenFromRequest(req);
  const { latitude, longitude, accuracy, embedding, liveness } =
    req.body as AttendanceSubmitBody;
  const location =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    typeof accuracy === "number"
      ? { latitude, longitude, accuracy }
      : undefined;
  const result = await submitAttendance(req.user!.id, {
    deviceToken,
    location,
    embedding,
    liveness
  });
  success(res, 201, "Attendance submitted successfully", result);
});

/** Legacy explicit registration; returns the fresh credential in the body. */
export const registerDeviceHandler = catchAsync(async (req, res: Response) => {
  const device = await provisionDevice(req.user!.id);
  success(res, 201, "Device registered successfully", device);
});

/**
 * Provision the device credential for this staff member and hand it over via
 * an HttpOnly cookie. Existing cookies are reused; REVOKED credentials are
 * replaced with a fresh PENDING one that must pass live face verification.
 */
export const provisionDeviceHandler = catchAsync(async (req, res: Response) => {
  const existing = getDeviceTokenFromRequest(req);
  const userId = req.user!.id;

  if (existing) {
    const device = await findDeviceForUser(userId, existing);
    if (device && device.status !== "REVOKED") {
      success(
        res,
        200,
        device.status === "ACTIVE"
          ? "Device already registered"
          : "Device pending identity confirmation",
        {
          status: device.status,
          requiresVerification: device.status === "PENDING",
          deviceId: device.id
        }
      );
      return;
    }
  }

  const provisioned = await provisionDevice(userId);
  res.cookie(DEVICE_COOKIE_NAME, provisioned.deviceToken, {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: req.secure || req.headers["x-forwarded-proto"] === "https",
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: "/"
  });
  success(res, 201, "Device provisioned", {
    status: provisioned.status,
    requiresVerification: true,
    deviceId: provisioned.deviceId
  });
});

export const deviceStatusHandler = catchAsync(async (req, res: Response) => {
  const deviceToken = getDeviceTokenFromRequest(req);
  const userId = req.user!.id;

  if (!deviceToken) {
    success(res, 200, "No device registered", { registered: false });
    return;
  }

  const device = await findDeviceForUser(userId, deviceToken);
  if (!device) {
    success(res, 200, "No device registered", { registered: false });
    return;
  }

  success(res, 200, "Device status retrieved", {
    registered: true,
    status: device.status,
    requiresVerification: device.status === "PENDING",
    deviceId: device.id
  });
});

export const myAttendanceHandler = catchAsync(async (req, res: Response) => {
  const records = await getMyAttendance(req.user!.id);
  success(res, 200, "Attendance records retrieved", { records });
});

/**
 * Geofence pre-check for the "Verify my location" step. Returns the same
 * verified/reason the submission flow would enforce, purely for display.
 */
export const verifyLocationHandler = catchAsync(async (req, res: Response) => {
  const { latitude, longitude, accuracy } = req.body as LocationPrecheckBody;
  const result = await precheckLocation({ latitude, longitude, accuracy });
  success(res, 200, "Location verified", result);
});