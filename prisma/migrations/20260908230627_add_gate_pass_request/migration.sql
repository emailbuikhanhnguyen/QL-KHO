-- CreateEnum
CREATE TYPE "gate_pass_request_status" AS ENUM ('DRAFT', 'PENDING_MANAGER_APPROVAL', 'PENDING_HR_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "gate_pass_requests" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "requested_by" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "pass_date" DATE NOT NULL,
    "time_out" TEXT NOT NULL,
    "time_in" TEXT,
    "purpose" TEXT NOT NULL,
    "related_people" TEXT,
    "status" "gate_pass_request_status" NOT NULL DEFAULT 'DRAFT',
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

    CONSTRAINT "gate_pass_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gate_pass_requests_code_key" ON "gate_pass_requests"("code");

-- CreateIndex
CREATE INDEX "gate_pass_requests_requested_by_idx" ON "gate_pass_requests"("requested_by");

-- CreateIndex
CREATE INDEX "gate_pass_requests_department_id_idx" ON "gate_pass_requests"("department_id");

-- CreateIndex
CREATE INDEX "gate_pass_requests_status_idx" ON "gate_pass_requests"("status");

-- AddForeignKey
ALTER TABLE "gate_pass_requests" ADD CONSTRAINT "gate_pass_requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
