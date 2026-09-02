import request from "supertest";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { encryptEmbedding } from "../src/services/biometric.service";
import { createApp } from "../src/app";

export const ADMIN_CREDENTIALS = {
  email: "admin@test.com",
  password: "Admin@12345"
};

export const DEPT_NAMES = [
  "Software Development",
  "Building Construction",
  "Electronics and Telecommunication",
  "Ordinary Level",
  "Administration"
];

export type TestUser = {
  id: number;
  email: string;
  password: string;
  departmentId: number;
};

/** Returns a fresh app instance (fresh in-memory rate limiters) bound to supertest. */
export function getApi() {
  return request(createApp());
}

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "attendance", "users", "devices", "departments", "school_settings", "security_events" RESTART IDENTITY CASCADE'
  );
}

export interface SeededData {
  departments: Record<string, number>;
  admin: TestUser;
}

/** Reset DB and seed the production departments + an ACTIVE admin. Call in beforeEach. */
export async function seedBase(): Promise<SeededData> {
  await resetDatabase();

  const departments: Record<string, number> = {};
  for (const name of DEPT_NAMES) {
    const dept = await prisma.department.create({ data: { name } });
    departments[name] = dept.id;
  }
  await prisma.department.update({
    where: { id: departments["Administration"] },
    data: { isPublic: false }
  });

  const adminHash = await hashPassword(ADMIN_CREDENTIALS.password);
  const admin = await prisma.user.create({
    data: {
      fullName: "System Admin",
      email: ADMIN_CREDENTIALS.email,
      phoneNumber: "100000000000",
      departmentId: departments["Administration"],
      passwordHash: adminHash,
      role: "ADMIN",
      status: "ACTIVE"
    }
  });

  return {
    departments,
    admin: {
      id: admin.id,
      email: admin.email,
      password: ADMIN_CREDENTIALS.password,
      departmentId: departments["Administration"]
    }
  };
}

export async function loginAsAdmin() {
  const res = await getApi()
    .post("/api/auth/login")
    .send({
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password
    });
  if (!res.body?.data?.token) {
    throw new Error(
      `loginAsAdmin failed: ${res.status} ${JSON.stringify(res.body)}`
    );
  }
  return res.body.data.token as string;
}

export async function loginAsUser(
  email: string,
  password: string
): Promise<string> {
  const res = await getApi()
    .post("/api/auth/login")
    .send({ email, password });
  if (!res.body?.data?.token) {
    throw new Error(
      `loginAsUser failed: ${res.status} ${JSON.stringify(res.body)}`
    );
  }
  return res.body.data.token as string;
}

/** Creates a user directly in the DB with the given role/status. */
export async function createUserDb(
  data: {
    fullName?: string;
    email: string;
    phoneNumber: string;
    password?: string;
    departmentId: number;
    role?: "STAFF" | "ADMIN";
    status?: "PENDING" | "ACTIVE" | "REJECTED";
  }
): Promise<TestUser> {
  const password = data.password ?? "Password@123";
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      fullName: data.fullName ?? "Staff Member",
      email: data.email,
      phoneNumber: data.phoneNumber,
      departmentId: data.departmentId,
      passwordHash,
      role: data.role ?? "STAFF",
      status: data.status ?? "PENDING"
    }
  });
  return {
    id: user.id,
    email: user.email,
    password,
    departmentId: user.departmentId
  };
}

export const STAFF_SIGNUP_FIELDS = (depId: number) => ({
  full_name: "Jane Smith",
  email: "jane@test.com",
  phone_number: "2012345678",
  department_id: depId,
  password: "Password@123",
  confirm_password: "Password@123"
});

/**
 * Reference embeddings used by the test suites.
 *
 * The embeddings are one-hot vectors of length 128 so similarity is trivial:
 * FACE_EMBEDDING_A matches a template enrolled from FACE_EMBEDDING_A (cosine
 * similarity 1.0) and clearly does NOT match a template enrolled from
 * FACE_EMBEDDING_B (cosine similarity 0.0).
 */
function buildUnitVector(index: number): number[] {
  const vector = new Array(128).fill(0);
  vector[index] = 1;
  return vector;
}

export const FACE_EMBEDDING_A = buildUnitVector(0);
export const FACE_EMBEDDING_B = buildUnitVector(1);

/** Seed a reference face for a staff member directly in the DB. */
export async function enrollFace(
  userId: number,
  embedding: number[] = FACE_EMBEDDING_A
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      faceReference: encryptEmbedding(embedding),
      faceReferenceStatus: "REGISTERED"
    }
  });
}

/** Build a valid attendance submission payload (location + face + liveness). */
export const attendancePayload = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  latitude: -1.9441,
  longitude: 30.0619,
  accuracy: 10,
  embedding: FACE_EMBEDDING_A,
  liveness: true,
  ...overrides
});