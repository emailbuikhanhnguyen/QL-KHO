-- CreateEnum
CREATE TYPE "warehouse_transfer_status" AS ENUM ('DRAFT', 'SHIPPED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "warehouse_transfers" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "source_warehouse_id" INTEGER NOT NULL,
    "dest_warehouse_id" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "warehouse_transfer_status" NOT NULL DEFAULT 'DRAFT',
    "shipped_at" TIMESTAMP(3),
    "shipped_by" INTEGER,
    "received_at" TIMESTAMP(3),
    "received_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "warehouse_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_transfer_lines" (
    "id" SERIAL NOT NULL,
    "warehouse_transfer_id" INTEGER NOT NULL,
    "lot_id" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_transfers_code_key" ON "warehouse_transfers"("code");

-- CreateIndex
CREATE INDEX "warehouse_transfers_source_warehouse_id_idx" ON "warehouse_transfers"("source_warehouse_id");

-- CreateIndex
CREATE INDEX "warehouse_transfers_dest_warehouse_id_idx" ON "warehouse_transfers"("dest_warehouse_id");

-- CreateIndex
CREATE INDEX "warehouse_transfers_status_idx" ON "warehouse_transfers"("status");

-- CreateIndex
CREATE INDEX "warehouse_transfers_deleted_at_idx" ON "warehouse_transfers"("deleted_at");

-- CreateIndex
CREATE INDEX "warehouse_transfer_lines_warehouse_transfer_id_idx" ON "warehouse_transfer_lines"("warehouse_transfer_id");

-- CreateIndex
CREATE INDEX "warehouse_transfer_lines_lot_id_idx" ON "warehouse_transfer_lines"("lot_id");

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_source_warehouse_id_fkey" FOREIGN KEY ("source_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_dest_warehouse_id_fkey" FOREIGN KEY ("dest_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_shipped_by_fkey" FOREIGN KEY ("shipped_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfer_lines" ADD CONSTRAINT "warehouse_transfer_lines_warehouse_transfer_id_fkey" FOREIGN KEY ("warehouse_transfer_id") REFERENCES "warehouse_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfer_lines" ADD CONSTRAINT "warehouse_transfer_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
