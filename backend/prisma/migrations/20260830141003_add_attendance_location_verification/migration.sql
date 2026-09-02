-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "location_verification_result" TEXT,
ADD COLUMN     "location_verified_at" TIMESTAMP(3);
