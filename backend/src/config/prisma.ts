import { PrismaClient } from "@prisma/client";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Build a Prisma client instance. When `datasourceUrl` is provided it
 * overrides DATABASE_URL (used by tests to point at the test database).
 */
export function createPrismaClient(datasourceUrl?: string): PrismaClient {
  return new PrismaClient(
    datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : undefined
  );
}

export const prisma =
  global.prisma ??
  createPrismaClient(env.NODE_ENV === "test" ? env.DATABASE_URL_TEST : undefined);

if (env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
