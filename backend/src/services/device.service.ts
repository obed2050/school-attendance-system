import { createHash, randomBytes } from "crypto";
import { DeviceStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";

export const DEVICE_COOKIE_NAME = "school_device";

/**
 * Device credentials are generated server-side and delivered to the client
 * exactly once (as an HttpOnly cookie in the browser flow). Only the SHA-256
 * hash is ever persisted, so a data leak cannot recover usable credentials.
 */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type DeviceResolution = {
  id: number;
  status: DeviceStatus;
  revokedAt: Date | null;
} | null;

export async function findDeviceForUser(
  userId: number,
  rawToken: string
): Promise<DeviceResolution> {
  const deviceTokenHash = hashDeviceToken(rawToken);
  return prisma.device.findFirst({
    where: { userId, deviceTokenHash },
    select: { id: true, status: true, revokedAt: true }
  });
}

/**
 * Provision a fresh device credential. The device is created PENDING and only
 * becomes ACTIVE once its owner passes a live face verification on the next
 * attendance submission. This is what makes "unknown device" safe: a stolen or
 * borrowed browser can never bypass identity verification by provisioning.
 */
export async function provisionDevice(userId: number): Promise<{
  deviceToken: string;
  deviceId: number;
  status: DeviceStatus;
}> {
  const deviceToken = generateDeviceToken();
  const deviceTokenHash = hashDeviceToken(deviceToken);

  const device = await prisma.device.create({
    data: { userId, deviceTokenHash, status: "PENDING" }
  });

  await prisma.user.update({
    where: { id: userId },
    data: { deviceRegistrationStatus: "REGISTERED" }
  });

  return {
    deviceToken,
    deviceId: device.id,
    status: "PENDING"
  };
}

export async function activateDevice(
  userId: number,
  deviceId: number
): Promise<boolean> {
  const result = await prisma.device.updateMany({
    where: { id: deviceId, userId, status: "PENDING" },
    data: { status: "ACTIVE", lastUsedAt: new Date() }
  });
  return result.count > 0;
}

export async function touchDevice(userId: number, deviceId: number): Promise<void> {
  await prisma.device.updateMany({
    where: { id: deviceId, userId, status: "ACTIVE" },
    data: { lastUsedAt: new Date() }
  });
}

export async function revokeDevice(
  userId: number,
  deviceId: number
): Promise<{ id: number }> {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
    select: { id: true, status: true }
  });
  if (!device) {
    throw new ApiError(404, "Device not found");
  }
  await prisma.device.update({
    where: { id: deviceId },
    data: { status: "REVOKED", revokedAt: new Date() }
  });
  return { id: deviceId };
}

export async function listDevicesForUser(userId: number) {
  return prisma.device.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true
    }
  });
}

export async function countActiveDevicesForUser(userId: number): Promise<number> {
  return prisma.device.count({ where: { userId, status: "ACTIVE" } });
}