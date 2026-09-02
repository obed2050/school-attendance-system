-- AlterTable
-- Mark all existing departments public by default; the seed script marks
-- "Administration" (admin-only) as non-public.
ALTER TABLE "departments" ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT true;