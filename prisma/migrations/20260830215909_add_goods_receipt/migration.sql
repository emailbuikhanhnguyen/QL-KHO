-- CreateEnum
CREATE TYPE "goods_receipt_status" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "stock_movement_type" AS ENUM ('RECEIPT', 'ISSUE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'RETURN');

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "department_id" INTEGER;

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "po_number" TEXT,
    "packing_list_number" TEXT,
    "invoice_number" TEXT,
    "status" "goods_receipt_status" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" INTEGER,
    "rejected_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" SERIAL NOT NULL,
    "goods_receipt_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "lot_code" TEXT NOT NULL,
    "color" TEXT,
    "size" TEXT,
    "manufacture_date" DATE,
    "expiry_date" DATE,
    "quantity" DECIMAL(18,3) NOT NULL,
    "storage_location_id" INTEGER,
    "lot_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_ledger_entries" (
    "id" SERIAL NOT NULL,
    "lot_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "storage_location_id" INTEGER,
    "movement_type" "stock_movement_type" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,

    CONSTRAINT "stock_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_code_key" ON "goods_receipts"("code");

-- CreateIndex
CREATE INDEX "goods_receipts_warehouse_id_idx" ON "goods_receipts"("warehouse_id");

-- CreateIndex
CREATE INDEX "goods_receipts_supplier_id_idx" ON "goods_receipts"("supplier_id");

-- CreateIndex
CREATE INDEX "goods_receipts_status_idx" ON "goods_receipts"("status");

-- CreateIndex
CREATE INDEX "goods_receipts_po_number_idx" ON "goods_receipts"("po_number");

-- CreateIndex
CREATE INDEX "goods_receipts_deleted_at_idx" ON "goods_receipts"("deleted_at");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_goods_receipt_id_idx" ON "goods_receipt_lines"("goods_receipt_id");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_item_id_idx" ON "goods_receipt_lines"("item_id");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_lot_id_idx" ON "goods_receipt_lines"("lot_id");

-- CreateIndex
CREATE INDEX "stock_ledger_entries_lot_id_idx" ON "stock_ledger_entries"("lot_id");

-- CreateIndex
CREATE INDEX "stock_ledger_entries_item_id_idx" ON "stock_ledger_entries"("item_id");

-- CreateIndex
CREATE INDEX "stock_ledger_entries_warehouse_id_idx" ON "stock_ledger_entries"("warehouse_id");

-- CreateIndex
CREATE INDEX "stock_ledger_entries_reference_type_reference_id_idx" ON "stock_ledger_entries"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "warehouses_department_id_idx" ON "warehouses"("department_id");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
