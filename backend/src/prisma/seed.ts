import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";
import { hashPassword } from "../utils/password";
import { seedSchoolSettings } from "../services/settings.service";

const prisma = new PrismaClient();

const DEPARTMENTS = [
  { name: "Software Development", isPublic: true },
  { name: "Building Construction", isPublic: true },
  { name: "Electronics and Telecommunication", isPublic: true },
  { name: "Ordinary Level", isPublic: true },
  { name: "Administration", isPublic: false }
];

const OBSOLETE_DEPARTMENTS = [
  "ICT",
  "Mathematics",
  "Science",
  "Languages",
  "Finance",
  "Other"
];

async function seedDepartments(): Promise<void> {
  for (const { name, isPublic } of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name },
      update: { isPublic },
      create: { name, isPublic }
    });
    // eslint-disable-next-line no-console
    console.log(
      `  ✔ Department seeded: ${name}${isPublic ? "" : " (admin only)"}`
    );
  }

  // Remove obsolete departments ONLY if they have no users attached.
  for (const name of OBSOLETE_DEPARTMENTS) {
    const existing = await prisma.department.findUnique({
      where: { name },
      include: { users: { select: { id: true } } }
    });
    if (existing && existing.users.length === 0) {
      await prisma.department.delete({ where: { name } });
      // eslint-disable-next-line no-console
      console.log(`  ✔ Removed obsolete department: ${name}`);
    }
  }
}

async function seedAdmin(): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    // eslint-disable-next-line no-console
    console.log("  ⚠ ADMIN_EMAIL / ADMIN_PASSWORD not set. Skipping admin seed.");
    return;
  }

  const adminDept = await prisma.department.findUnique({
    where: { name: "Administration" }
  });

  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);

  await prisma.user.upsert({
    where: { email: env.ADMIN_EMAIL },
    update: {
      fullName: env.ADMIN_NAME,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      departmentId: adminDept?.id ?? undefined
    },
    create: {
      fullName: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL,
      phoneNumber: "000000000000",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      departmentId: adminDept?.id ?? 0
    }
  });

  // eslint-disable-next-line no-console
  console.log(`  ✔ Admin seeded: ${env.ADMIN_EMAIL}`);
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Seeding database...");
  await seedDepartments();
  await seedSchoolSettings();
  await seedAdmin();
  // eslint-disable-next-line no-console
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Seeding failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
