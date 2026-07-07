/*
  Warnings:

  - You are about to drop the column `available` on the `instructor_availability` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email]` on the table `instructors` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'AVOID', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "instructor_availability" DROP COLUMN "available",
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "instructors" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "group_id" TEXT,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "students_email_key" ON "students"("email");

-- CreateIndex
CREATE UNIQUE INDEX "instructors_email_key" ON "instructors"("email");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lab_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
