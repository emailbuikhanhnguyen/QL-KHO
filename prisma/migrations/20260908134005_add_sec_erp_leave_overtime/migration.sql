-- CreateEnum
CREATE TYPE "leave_type" AS ENUM ('ANNUAL', 'UNPAID', 'SICK', 'OTHER');

-- CreateEnum
CREATE TYPE "leave_request_status" AS ENUM ('DRAFT', 'PENDING_MANAGER_APPROVAL', 'PENDING_HR_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "overtime_request_status" AS ENUM ('DRAFT', 'PENDING_MANAGER_APPROVAL', 'PENDING_HR_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "role" ADD VALUE 'HR';

-- CreateTable
CREATE TABLE "attachments" (
    "id" SERIAL NOT NULL,
    "related_type" TEXT NOT NULL,
    "related_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "requested_by" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "leave_type" "leave_type" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "leave_request_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "manager_approved_by" INTEGER,
    "manager_approved_at" TIMESTAMP(3),
    "hr_approved_by" INTEGER,
    "hr_approved_at" TIMESTAMP(3),
    "rejected_by" INTEGER,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "department_id" INTEGER NOT NULL,
    "ot_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "overtime_request_status" NOT NULL DEFAULT 'DRAFT',
    "requested_by" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "manager_approved_by" INTEGER,
    "manager_approved_at" TIMESTAMP(3),
    "hr_approved_by" INTEGER,
    "hr_approved_at" TIMESTAMP(3),
    "rejected_by" INTEGER,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_request_lines" (
    "id" SERIAL NOT NULL,
    "overtime_request_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "overtime_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_related_type_related_id_idx" ON "attachments"("related_type", "related_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_code_key" ON "leave_requests"("code");

-- CreateIndex
CREATE INDEX "leave_requests_requested_by_idx" ON "leave_requests"("requested_by");

-- CreateIndex
CREATE INDEX "leave_requests_department_id_idx" ON "leave_requests"("department_id");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_requests_code_key" ON "overtime_requests"("code");

-- CreateIndex
CREATE INDEX "overtime_requests_department_id_idx" ON "overtime_requests"("department_id");

-- CreateIndex
CREATE INDEX "overtime_requests_status_idx" ON "overtime_requests"("status");

-- CreateIndex
CREATE INDEX "overtime_request_lines_overtime_request_id_idx" ON "overtime_request_lines"("overtime_request_id");

-- CreateIndex
CREATE INDEX "overtime_request_lines_user_id_idx" ON "overtime_request_lines"("user_id");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_request_lines" ADD CONSTRAINT "overtime_request_lines_overtime_request_id_fkey" FOREIGN KEY ("overtime_request_id") REFERENCES "overtime_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
