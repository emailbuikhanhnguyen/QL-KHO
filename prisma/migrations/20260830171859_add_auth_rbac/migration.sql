-- CreateEnum
CREATE TYPE "zone_type" AS ENUM ('NORMAL', 'QUARANTINE');

-- CreateEnum
CREATE TYPE "role" AS ENUM ('ADMIN', 'WAREHOUSE_STAFF', 'DEPT_HEAD', 'BOD', 'QC_MANAGER', 'REQUESTER');

-- AlterTable
ALTER TABLE "lots" ADD COLUMN     "invoice_number" TEXT,
ADD COLUMN     "packing_list_number" TEXT,
ADD COLUMN     "po_number" TEXT;

-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "zone_type" "zone_type" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "role" NOT NULL,
    "department_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "departments_deleted_at_idx" ON "departments"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_department_id_idx" ON "users"("department_id");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "lots_po_number_idx" ON "lots"("po_number");

-- CreateIndex
CREATE INDEX "zones_zone_type_idx" ON "zones"("zone_type");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
