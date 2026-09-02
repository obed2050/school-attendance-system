import { Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { hashPassword } from "../utils/password";
import {
  CreateUserInput,
  ResetPasswordInput,
  UpdateUserInput,
  UserListQuery
} from "../validators/admin";

const PUBLIC_USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phoneNumber: true,
  role: true,
  status: true,
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

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

async function validateDepartment(departmentId: number): Promise<void> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId }
  });
  if (!department) {
    throw new ApiError(422, "Selected department does not exist");
  }
}

async function ensureUniqueCredentials(
  email: string,
  phoneNumber: string,
  excludeUserId?: number
): Promise<void> {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { phoneNumber }],
      ...(excludeUserId ? { id: { not: excludeUserId } } : {})
    }
  });
  if (existing) {
    if (existing.email === email) {
      throw new ApiError(409, "A user with this email already exists");
    }
    throw new ApiError(409, "A user with this phone number already exists");
  }
}

/**
 * Prevent the last active administrator from being removed/downgraded.
 * `target` is the user being modified, `nextRole`/`nextStatus` are the
 * values the account should have after the operation.
 */
async function guardLastActiveAdmin(
  target: { id: number; role: Role; status: UserStatus },
  nextRole: Role,
  nextStatus: UserStatus
): Promise<void> {
  const isCurrentlyActiveAdmin =
    target.role === "ADMIN" && target.status === "ACTIVE";
  const willRemainActiveAdmin = nextRole === "ADMIN" && nextStatus === "ACTIVE";

  if (isCurrentlyActiveAdmin && !willRemainActiveAdmin) {
    const activeAdminCount = await prisma.user.count({
      where: { role: "ADMIN", status: "ACTIVE" }
    });
    if (activeAdminCount <= 1) {
      throw new ApiError(
        400,
        "At least one active administrator must remain in the system."
      );
    }
  }
}

export async function listUsers(
  query: UserListQuery
): Promise<PaginatedResult<PublicUser>> {
  const where: Prisma.UserWhereInput = {};

  if (query.role) {
    where.role = query.role;
  }
  if (query.status) {
    where.status = query.status;
  }
  if (query.department) {
    where.departmentId = query.department;
  }
  if (query.search) {
    const term = query.search;
    where.OR = [
      { fullName: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
      { phoneNumber: { contains: term, mode: "insensitive" } }
    ];
  }

  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: PUBLIC_USER_SELECT
    }),
    prisma.user.count({ where })
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  await validateDepartment(input.department_id);
  await ensureUniqueCredentials(input.email, input.phone_number);

  const role: Role = input.role;
  let status: UserStatus = input.status;
  if (role === "ADMIN") {
    status = "ACTIVE";
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      fullName: input.full_name,
      email: input.email,
      phoneNumber: input.phone_number,
      departmentId: input.department_id,
      passwordHash,
      role,
      status
    },
    select: PUBLIC_USER_SELECT
  });

  return user;
}

export async function updateUser(
  userId: number,
  input: UpdateUserInput
): Promise<PublicUser> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    throw new ApiError(404, "User not found");
  }

  if (input.department_id) {
    await validateDepartment(input.department_id);
  }
  if (input.email || input.phone_number) {
    await ensureUniqueCredentials(
      input.email ?? target.email,
      input.phone_number ?? target.phoneNumber,
      userId
    );
  }

  const nextRole = input.role ?? target.role;
  const nextStatus = input.status ?? target.status;
  await guardLastActiveAdmin(target, nextRole, nextStatus);

  const data: Prisma.UserUpdateInput = {};
  if (input.full_name !== undefined) data.fullName = input.full_name;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone_number !== undefined) data.phoneNumber = input.phone_number;
  if (input.department_id !== undefined) {
    data.department = { connect: { id: input.department_id } };
  }
  if (input.role !== undefined) data.role = input.role;
  if (input.status !== undefined) data.status = input.status;

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: PUBLIC_USER_SELECT
  });

  return updated;
}

/**
 * Validate + hash a new password and replace the stored hash.
 * The plain password is never returned.
 */
export async function resetUserPassword(
  userId: number,
  input: ResetPasswordInput
): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    throw new ApiError(404, "User not found");
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash }
  });
}