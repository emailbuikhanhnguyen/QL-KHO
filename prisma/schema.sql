-- Module 1/6 — Danh muc & Master Data
-- He thong Quan ly Kho NPL
-- Tuong duong SQL cua prisma/schema.prisma (Postgres)
-- Luu y: file nay la ban tham khao / export thu cong.
-- Nguon chuan de tao migration thuc te la `npx prisma migrate dev` (xem README).

CREATE TYPE "qc_status" AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'PASSED',
  'FAILED',
  'PARTIALLY_PASSED',
  'PENDING_DISPOSITION'
);

-- ---------------------------------------------------------------------------
CREATE TABLE "item_groups" (
  "id"          SERIAL PRIMARY KEY,
  "code"        VARCHAR(50)  NOT NULL UNIQUE,
  "name"        VARCHAR(255) NOT NULL,
  "description" TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  "created_by"  INTEGER,
  "updated_by"  INTEGER,
  "deleted_at"  TIMESTAMP(3)
);
CREATE INDEX "item_groups_deleted_at_idx" ON "item_groups" ("deleted_at");

-- ---------------------------------------------------------------------------
CREATE TABLE "items" (
  "id"            SERIAL PRIMARY KEY,
  "code"          VARCHAR(50)  NOT NULL UNIQUE,
  "name"          VARCHAR(255) NOT NULL,
  "spec"          TEXT,
  "unit"          VARCHAR(20)  NOT NULL,
  "item_group_id" INTEGER      NOT NULL REFERENCES "item_groups"("id"),
  "min_stock"     DECIMAL(18,3) NOT NULL,
  "max_stock"     DECIMAL(18,3) NOT NULL,
  "is_active"     BOOLEAN      NOT NULL DEFAULT true,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  "created_by"    INTEGER,
  "updated_by"    INTEGER,
  "deleted_at"    TIMESTAMP(3)
);
CREATE INDEX "items_item_group_id_idx" ON "items" ("item_group_id");
CREATE INDEX "items_deleted_at_idx" ON "items" ("deleted_at");

-- ---------------------------------------------------------------------------
CREATE TABLE "suppliers" (
  "id"             SERIAL PRIMARY KEY,
  "code"           VARCHAR(50)  NOT NULL UNIQUE,
  "name"           VARCHAR(255) NOT NULL,
  "tax_code"       VARCHAR(50),
  "address"        TEXT,
  "contact_person" VARCHAR(255),
  "phone"          VARCHAR(30),
  "email"          VARCHAR(255),
  "is_active"      BOOLEAN      NOT NULL DEFAULT true,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  "created_by"     INTEGER,
  "updated_by"     INTEGER,
  "deleted_at"     TIMESTAMP(3)
);
CREATE INDEX "suppliers_deleted_at_idx" ON "suppliers" ("deleted_at");

-- ---------------------------------------------------------------------------
CREATE TABLE "warehouses" (
  "id"         SERIAL PRIMARY KEY,
  "code"       VARCHAR(50)  NOT NULL UNIQUE,
  "name"       VARCHAR(255) NOT NULL,
  "address"    TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_by" INTEGER,
  "updated_by" INTEGER,
  "deleted_at" TIMESTAMP(3)
);
CREATE INDEX "warehouses_deleted_at_idx" ON "warehouses" ("deleted_at");

-- ---------------------------------------------------------------------------
CREATE TABLE "zones" (
  "id"           SERIAL PRIMARY KEY,
  "warehouse_id" INTEGER      NOT NULL REFERENCES "warehouses"("id"),
  "code"         VARCHAR(50)  NOT NULL,
  "name"         VARCHAR(255) NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  "created_by"   INTEGER,
  "updated_by"   INTEGER,
  "deleted_at"   TIMESTAMP(3),
  UNIQUE ("warehouse_id", "code")
);
CREATE INDEX "zones_warehouse_id_idx" ON "zones" ("warehouse_id");
CREATE INDEX "zones_deleted_at_idx" ON "zones" ("deleted_at");

-- ---------------------------------------------------------------------------
CREATE TABLE "racks" (
  "id"         SERIAL PRIMARY KEY,
  "zone_id"    INTEGER     NOT NULL REFERENCES "zones"("id"),
  "code"       VARCHAR(50) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_by" INTEGER,
  "updated_by" INTEGER,
  "deleted_at" TIMESTAMP(3),
  UNIQUE ("zone_id", "code")
);
CREATE INDEX "racks_zone_id_idx" ON "racks" ("zone_id");
CREATE INDEX "racks_deleted_at_idx" ON "racks" ("deleted_at");

-- ---------------------------------------------------------------------------
CREATE TABLE "storage_locations" (
  "id"           SERIAL PRIMARY KEY,
  "rack_id"      INTEGER      NOT NULL REFERENCES "racks"("id"),
  "code"         VARCHAR(50)  NOT NULL,
  "max_capacity" DECIMAL(18,3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  "created_by"   INTEGER,
  "updated_by"   INTEGER,
  "deleted_at"   TIMESTAMP(3),
  UNIQUE ("rack_id", "code")
);
CREATE INDEX "storage_locations_rack_id_idx" ON "storage_locations" ("rack_id");
CREATE INDEX "storage_locations_deleted_at_idx" ON "storage_locations" ("deleted_at");

-- ---------------------------------------------------------------------------
CREATE TABLE "lots" (
  "id"               SERIAL PRIMARY KEY,
  "item_id"          INTEGER      NOT NULL REFERENCES "items"("id"),
  "lot_code"         VARCHAR(100) NOT NULL,
  "color"            VARCHAR(50),
  "size"             VARCHAR(50),
  "manufacture_date" DATE,
  "expiry_date"      DATE,
  "supplier_id"      INTEGER      NOT NULL REFERENCES "suppliers"("id"),
  "qc_status"        "qc_status"  NOT NULL DEFAULT 'PENDING',
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  "created_by"       INTEGER,
  "updated_by"       INTEGER,
  "deleted_at"       TIMESTAMP(3),
  UNIQUE ("item_id", "lot_code")
);
CREATE INDEX "lots_item_id_idx" ON "lots" ("item_id");
CREATE INDEX "lots_supplier_id_idx" ON "lots" ("supplier_id");
CREATE INDEX "lots_qc_status_idx" ON "lots" ("qc_status");
CREATE INDEX "lots_deleted_at_idx" ON "lots" ("deleted_at");
