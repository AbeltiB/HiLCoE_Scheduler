/*
  Warnings:

  - You are about to drop the column `version_id` on the `assignments` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "uq_assignment_room_slot_per_version";

-- AlterTable
ALTER TABLE "assignments" DROP COLUMN "version_id",
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
