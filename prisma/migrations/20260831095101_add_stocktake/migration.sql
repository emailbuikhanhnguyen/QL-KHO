-- CreateEnum
CREATE TYPE "stocktake_status" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "stocktake_tolerance_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "stocktakes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "status" "stocktake_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_by" INTEGER,
    "completed_at" TIMESTAMP(3),
    "completed_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" INTEGER,
    "force_completed_reason" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocktakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktake_lines" (
    "id" SERIAL NOT NULL,
    "stocktake_id" INTEGER NOT NULL,
    "lot_id" INTEGER NOT NULL,
    "system_quantity" DECIMAL(18,3) NOT NULL,
    "counted_quantity" DECIMAL(18,3),
    "variance" DECIMAL(18,3),
    "counted_at" TIMESTAMP(3),
    "counted_by" INTEGER,
    "note" TEXT,

    CONSTRAINT "stocktake_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktake_locks" (
    "id" SERIAL NOT NULL,
    "stocktake_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_by" INTEGER,
    "released_at" TIMESTAMP(3),
    "released_by" INTEGER,

    CONSTRAINT "stocktake_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stocktakes_code_key" ON "stocktakes"("code");

-- CreateIndex
CREATE INDEX "stocktakes_warehouse_id_idx" ON "stocktakes"("warehouse_id");

-- CreateIndex
CREATE INDEX "stocktakes_status_idx" ON "stocktakes"("status");

-- CreateIndex
CREATE INDEX "stocktake_lines_stocktake_id_idx" ON "stocktake_lines"("stocktake_id");

-- CreateIndex
CREATE INDEX "stocktake_lines_lot_id_idx" ON "stocktake_lines"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "stocktake_locks_stocktake_id_key" ON "stocktake_locks"("stocktake_id");

-- CreateIndex
CREATE INDEX "stocktake_locks_warehouse_id_released_at_idx" ON "stocktake_locks"("warehouse_id", "released_at");

-- AddForeignKey
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_stocktake_id_fkey" FOREIGN KEY ("stocktake_id") REFERENCES "stocktakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_locks" ADD CONSTRAINT "stocktake_locks_stocktake_id_fkey" FOREIGN KEY ("stocktake_id") REFERENCES "stocktakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_locks" ADD CONSTRAINT "stocktake_locks_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
