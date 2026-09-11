-- CreateEnum
CREATE TYPE "vehicle_booking_status" AS ENUM ('DRAFT', 'PENDING_MANAGER_APPROVAL', 'PENDING_ADMIN_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "vehicle_booking_requests" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "requested_by" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "use_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "departure" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "number_of_people" INTEGER NOT NULL,
    "status" "vehicle_booking_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "manager_approved_by" INTEGER,
    "manager_approved_at" TIMESTAMP(3),
    "admin_approved_by" INTEGER,
    "admin_approved_at" TIMESTAMP(3),
    "rejected_by" INTEGER,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "vehicle_booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_booking_requests_code_key" ON "vehicle_booking_requests"("code");

-- CreateIndex
CREATE INDEX "vehicle_booking_requests_requested_by_idx" ON "vehicle_booking_requests"("requested_by");

-- CreateIndex
CREATE INDEX "vehicle_booking_requests_department_id_idx" ON "vehicle_booking_requests"("department_id");

-- CreateIndex
CREATE INDEX "vehicle_booking_requests_status_idx" ON "vehicle_booking_requests"("status");

-- AddForeignKey
ALTER TABLE "vehicle_booking_requests" ADD CONSTRAINT "vehicle_booking_requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
