import { prisma } from "../config/prisma";

export async function listPublicDepartments() {
  const departments = await prisma.department.findMany({
    where: { isPublic: true },
    orderBy: { id: "asc" },
    select: { id: true, name: true }
  });
  return departments;
}

export async function listAllDepartments() {
  const departments = await prisma.department.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true }
  });
  return departments;
}
