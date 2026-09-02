import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { hashPassword, comparePassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { SignupInput, LoginInput } from "../validators/auth";
import {
  cosineSimilarity,
  decryptEmbedding,
  encryptEmbedding,
  faceMatches,
  isPlausibleEmbedding,
  IDENTITY_VERIFICATION_FAILED
} from "./biometric.service";
import { logSecurityEvent } from "./securityEvent.service";

const PUBLIC_USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phoneNumber: true,
  role: true,
  status: true,
  // Status flags only - never the raw biometric template itself.
  faceReferenceStatus: true,
  deviceRegistrationStatus: true,
  departmentId: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true } }
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof PUBLIC_USER_SELECT;
}>;

export async function signup(input: SignupInput): Promise<PublicUser> {
  const department = await prisma.department.findUnique({
    where: { id: input.department_id }
  });
  if (!department) {
    throw new ApiError(422, "Selected department does not exist");
  }
  if (!department.isPublic) {
    throw new ApiError(422, "Invalid department for public signup.");
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.email }, { phoneNumber: input.phone_number }]
    }
  });
  if (existing) {
    throw new ApiError(409, "An account with this email or phone number already exists");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      fullName: input.full_name,
      email: input.email,
      phoneNumber: input.phone_number,
      departmentId: input.department_id,
      passwordHash,
      role: "STAFF",
      status: "PENDING"
    },
    select: PUBLIC_USER_SELECT
  });

  return user;
}

export async function login(input: LoginInput): Promise<{ token: string; user: PublicUser }> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...PUBLIC_USER_SELECT, passwordHash: true }
  });

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (user.status === "PENDING") {
    throw new ApiError(403, "Your account is pending approval. Please wait for the administrator.");
  }

  if (user.status === "REJECTED") {
    throw new ApiError(403, "Your account has been rejected. Contact the administrator.");
  }

  const valid = await comparePassword(input.password, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, "Invalid email or password");
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;

  const token = signToken({ id: safeUser.id, role: safeUser.role });
  return { token, user: safeUser };
}

export async function getCurrentUser(userId: number): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PUBLIC_USER_SELECT
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
}

export async function listPendingUsers(): Promise<PublicUser[]> {
  const users = await prisma.user.findMany({
    where: { status: "PENDING", role: "STAFF" },
    select: PUBLIC_USER_SELECT,
    orderBy: { createdAt: "asc" }
  });
  return users;
}

export async function approveUser(userId: number): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.role === "ADMIN") {
    throw new ApiError(400, "Cannot modify an admin account this way");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
    select: PUBLIC_USER_SELECT
  });
  return updated;
}

export async function rejectUser(userId: number): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.role === "ADMIN") {
    throw new ApiError(400, "Cannot modify an admin account this way");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status: "REJECTED" },
    select: PUBLIC_USER_SELECT
  });
  return updated;
}

/**
 * Enroll or re-enroll a staff member's reference face.
 *
 * First-time enrollment (no stored template) just stores the encrypted
 * embedding. Re-enrollment additionally requires proof of identity against the
 * existing template so that a hijacked session cannot silently swap the
 * reference face.
 */
export async function setFaceReference(
  userId: number,
  embedding: number[],
  currentEmbedding?: number[]
): Promise<{ faceReferenceStatus: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, faceReference: true, faceReferenceStatus: true }
  });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.faceReference && user.faceReferenceStatus === "REGISTERED") {
    if (!currentEmbedding || !isPlausibleEmbedding(currentEmbedding)) {
      throw new ApiError(403, IDENTITY_VERIFICATION_FAILED);
    }
    const existing = decryptEmbedding(user.faceReference);
    if (!faceMatches(cosineSimilarity(currentEmbedding, existing))) {
      throw new ApiError(403, IDENTITY_VERIFICATION_FAILED);
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      faceReference: encryptEmbedding(embedding),
      faceReferenceStatus: "REGISTERED"
    }
  });

  await logSecurityEvent({
    userId,
    eventType: "FACE_REFERENCE_UPDATED",
    message: "Reference face template enrolled"
  });

  return { faceReferenceStatus: "REGISTERED" };
}

/**
 * Admin action: wipe a staff member's face template so the staff member must
 * re-enroll before checking in again. Never returns the removed template.
 */
export async function resetFaceReferenceByAdmin(
  adminId: number,
  userId: number
): Promise<PublicUser> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    throw new ApiError(404, "User not found");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { faceReference: null, faceReferenceStatus: "NOT_REGISTERED" },
    select: PUBLIC_USER_SELECT
  });

  await logSecurityEvent({
    userId: target.id,
    eventType: "FACE_REFERENCE_RESET",
    message: `Reference face reset by admin #${adminId}`
  });

  return updated;
}
