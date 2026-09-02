-- CreateEnum
CREATE TYPE "FaceReferenceStatus" AS ENUM ('NOT_REGISTERED', 'REGISTERED');

-- CreateEnum
CREATE TYPE "DeviceRegistrationStatus" AS ENUM ('NOT_REGISTERED', 'REGISTERED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "device_id" INTEGER,
ADD COLUMN     "device_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "face_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "liveness_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "location_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qr_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verification_failure_reason" TEXT,
ADD COLUMN     "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "device_registration_status" "DeviceRegistrationStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
ADD COLUMN     "face_reference" TEXT,
ADD COLUMN     "face_reference_status" "FaceReferenceStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
ADD COLUMN     "last_attendance_at" TIMESTAMP(3),
ADD COLUMN     "last_attendance_device_id" INTEGER,
ADD COLUMN     "last_attendance_verification_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "school_settings" (
    "id" SERIAL NOT NULL,
    "singleton_key" TEXT NOT NULL DEFAULT 'default',
    "school_name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geofence_radius" INTEGER NOT NULL,
    "attendance_start_time" TEXT NOT NULL,
    "late_after_time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_token_hash" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_settings_singleton_key_key" ON "school_settings"("singleton_key");

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_token_hash_key" ON "devices"("device_token_hash");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
