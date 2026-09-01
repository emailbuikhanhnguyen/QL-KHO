-- CreateEnum
CREATE TYPE "qc_inspection_status" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "qc_inspections" (
    "id" SERIAL NOT NULL,
    "lot_id" INTEGER NOT NULL,
    "inspector_id" INTEGER,
    "result" "qc_status",
    "notes" TEXT,
    "status" "qc_inspection_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" INTEGER,
    "rejected_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "qc_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_inspection_images" (
    "id" SERIAL NOT NULL,
    "qc_inspection_id" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "original_file_name" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" INTEGER,

    CONSTRAINT "qc_inspection_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qc_inspections_lot_id_idx" ON "qc_inspections"("lot_id");

-- CreateIndex
CREATE INDEX "qc_inspections_status_idx" ON "qc_inspections"("status");

-- CreateIndex
CREATE INDEX "qc_inspections_deleted_at_idx" ON "qc_inspections"("deleted_at");

-- CreateIndex
CREATE INDEX "qc_inspection_images_qc_inspection_id_idx" ON "qc_inspection_images"("qc_inspection_id");

-- AddForeignKey
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspection_images" ADD CONSTRAINT "qc_inspection_images_qc_inspection_id_fkey" FOREIGN KEY ("qc_inspection_id") REFERENCES "qc_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
