-- CreateEnum
CREATE TYPE "qc_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED', 'PARTIALLY_PASSED', 'PENDING_DISPOSITION');

-- CreateTable
CREATE TABLE "item_groups" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "item_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "unit" TEXT NOT NULL,
    "item_group_id" INTEGER NOT NULL,
    "min_stock" DECIMAL(18,3) NOT NULL,
    "max_stock" DECIMAL(18,3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tax_code" TEXT,
    "address" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" SERIAL NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "racks" (
    "id" SERIAL NOT NULL,
    "zone_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "racks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_locations" (
    "id" SERIAL NOT NULL,
    "rack_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "max_capacity" DECIMAL(18,3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "storage_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "lot_code" TEXT NOT NULL,
    "color" TEXT,
    "size" TEXT,
    "manufacture_date" DATE,
    "expiry_date" DATE,
    "supplier_id" INTEGER NOT NULL,
    "qc_status" "qc_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_groups_code_key" ON "item_groups"("code");

-- CreateIndex
CREATE INDEX "item_groups_deleted_at_idx" ON "item_groups"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "items_code_key" ON "items"("code");

-- CreateIndex
CREATE INDEX "items_item_group_id_idx" ON "items"("item_group_id");

-- CreateIndex
CREATE INDEX "items_deleted_at_idx" ON "items"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE INDEX "suppliers_deleted_at_idx" ON "suppliers"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "warehouses_deleted_at_idx" ON "warehouses"("deleted_at");

-- CreateIndex
CREATE INDEX "zones_warehouse_id_idx" ON "zones"("warehouse_id");

-- CreateIndex
CREATE INDEX "zones_deleted_at_idx" ON "zones"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "zones_warehouse_id_code_key" ON "zones"("warehouse_id", "code");

-- CreateIndex
CREATE INDEX "racks_zone_id_idx" ON "racks"("zone_id");

-- CreateIndex
CREATE INDEX "racks_deleted_at_idx" ON "racks"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "racks_zone_id_code_key" ON "racks"("zone_id", "code");

-- CreateIndex
CREATE INDEX "storage_locations_rack_id_idx" ON "storage_locations"("rack_id");

-- CreateIndex
CREATE INDEX "storage_locations_deleted_at_idx" ON "storage_locations"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "storage_locations_rack_id_code_key" ON "storage_locations"("rack_id", "code");

-- CreateIndex
CREATE INDEX "lots_item_id_idx" ON "lots"("item_id");

-- CreateIndex
CREATE INDEX "lots_supplier_id_idx" ON "lots"("supplier_id");

-- CreateIndex
CREATE INDEX "lots_qc_status_idx" ON "lots"("qc_status");

-- CreateIndex
CREATE INDEX "lots_deleted_at_idx" ON "lots"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "lots_item_id_lot_code_key" ON "lots"("item_id", "lot_code");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_item_group_id_fkey" FOREIGN KEY ("item_group_id") REFERENCES "item_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racks" ADD CONSTRAINT "racks_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_locations" ADD CONSTRAINT "storage_locations_rack_id_fkey" FOREIGN KEY ("rack_id") REFERENCES "racks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
