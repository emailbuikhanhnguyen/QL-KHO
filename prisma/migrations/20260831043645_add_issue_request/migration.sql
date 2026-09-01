-- CreateEnum
CREATE TYPE "issue_request_status" AS ENUM ('DRAFT', 'PENDING_HEAD_APPROVAL', 'PENDING_BOD_APPROVAL', 'APPROVED', 'ISSUED', 'REJECTED');

-- CreateTable
CREATE TABLE "issue_requests" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "requester_id" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "issue_request_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "head_approved_at" TIMESTAMP(3),
    "head_approved_by" INTEGER,
    "bod_approved_at" TIMESTAMP(3),
    "bod_approved_by" INTEGER,
    "issued_at" TIMESTAMP(3),
    "issued_by" INTEGER,
    "rejected_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "issue_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_request_lines" (
    "id" SERIAL NOT NULL,
    "issue_request_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "requested_quantity" DECIMAL(18,3) NOT NULL,
    "issued_quantity" DECIMAL(18,3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "issue_requests_code_key" ON "issue_requests"("code");

-- CreateIndex
CREATE INDEX "issue_requests_warehouse_id_idx" ON "issue_requests"("warehouse_id");

-- CreateIndex
CREATE INDEX "issue_requests_requester_id_idx" ON "issue_requests"("requester_id");

-- CreateIndex
CREATE INDEX "issue_requests_department_id_idx" ON "issue_requests"("department_id");

-- CreateIndex
CREATE INDEX "issue_requests_status_idx" ON "issue_requests"("status");

-- CreateIndex
CREATE INDEX "issue_requests_deleted_at_idx" ON "issue_requests"("deleted_at");

-- CreateIndex
CREATE INDEX "issue_request_lines_issue_request_id_idx" ON "issue_request_lines"("issue_request_id");

-- CreateIndex
CREATE INDEX "issue_request_lines_item_id_idx" ON "issue_request_lines"("item_id");

-- AddForeignKey
ALTER TABLE "issue_requests" ADD CONSTRAINT "issue_requests_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_requests" ADD CONSTRAINT "issue_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_requests" ADD CONSTRAINT "issue_requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_requests" ADD CONSTRAINT "issue_requests_head_approved_by_fkey" FOREIGN KEY ("head_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_requests" ADD CONSTRAINT "issue_requests_bod_approved_by_fkey" FOREIGN KEY ("bod_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_requests" ADD CONSTRAINT "issue_requests_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_request_lines" ADD CONSTRAINT "issue_request_lines_issue_request_id_fkey" FOREIGN KEY ("issue_request_id") REFERENCES "issue_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_request_lines" ADD CONSTRAINT "issue_request_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
