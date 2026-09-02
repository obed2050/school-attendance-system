import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

/**
 * Lightweight security audit trail.
 *
 * Only event type + a short message + optionally a small metadata object are
 * recorded. Passwords, face templates, face images and device secrets must
 * never be passed here; the logger additionally refuses the well-known
 * biometric/secret field names as a guard.
 */

const FORBIDDEN_KEYS = [
  "embedding",
  "face",
  "template",
  "password",
  "token",
  "secret",
  "hash"
];

function sanitizeMetadata(metadata: Prisma.InputJsonValue | undefined): Prisma.InputJsonValue | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  if (FORBIDDEN_KEYS.some((key) => key in metadata)) return undefined;
  return metadata;
}

export async function logSecurityEvent(input: {
  userId?: number | null;
  eventType: string;
  message?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        userId: input.userId ?? null,
        eventType: input.eventType,
        message: input.message,
        metadata: sanitizeMetadata(input.metadata)
      }
    });
  } catch {
    // A failed audit write must never block the attendance flow.
  }
}