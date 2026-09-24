/*
  Warnings:

  - You are about to drop the column `licenseNumber` on the `Doctor` table. All the data in the column will be lost.
  - Added the required column `hospitalName` to the `Doctor` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Doctor_licenseNumber_key";

-- AlterTable
ALTER TABLE "Doctor" DROP COLUMN "licenseNumber",
ADD COLUMN     "hospitalName" TEXT NOT NULL;
