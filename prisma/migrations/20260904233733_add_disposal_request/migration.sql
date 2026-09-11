-- CreateEnum
CREATE TYPE "disposal_request_status" AS ENUM ('DRAFT', 'PENDING_QA_APPROVAL', 'PENDING_BOD_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "qc_status" ADD VALUE 'DISPOSED';

-- CreateTable
CREATE TABLE "disposal_requests" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "lot_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "disposal_request_status" NOT NULL DEFAULT 'DRAFT',
    "requested_by" INTEGER NOT NULL,
    "requested_at" TIMESTAMP(3),
    "qa_approved_by" INTEGER,
    "qa_approved_at" TIMESTAMP(3),
    "bod_approved_by" INTEGER,
    "bod_approved_at" TIMESTAMP(3),
    "rejected_by" INTEGER,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "disposal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disposal_requests_code_key" ON "disposal_requests"("code");

-- CreateIndex
CREATE INDEX "disposal_requests_lot_id_idx" ON "disposal_requests"("lot_id");

-- CreateIndex
CREATE INDEX "disposal_requests_warehouse_id_idx" ON "disposal_requests"("warehouse_id");

-- CreateIndex
CREATE INDEX "disposal_requests_status_idx" ON "disposal_requests"("status");

-- AddForeignKey
ALTER TABLE "disposal_requests" ADD CONSTRAINT "disposal_requests_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposal_requests" ADD CONSTRAINT "disposal_requests_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
