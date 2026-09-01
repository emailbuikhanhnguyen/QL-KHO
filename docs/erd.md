# ERD — Module 1/6: Danh mục & Master Data

```mermaid
erDiagram
    ITEM_GROUP ||--o{ ITEM : "phan loai"
    ITEM ||--o{ LOT : "co nhieu lo"
    SUPPLIER ||--o{ LOT : "cung cap"
    WAREHOUSE ||--o{ ZONE : "chua"
    ZONE ||--o{ RACK : "chua"
    RACK ||--o{ STORAGE_LOCATION : "chua"

    ITEM_GROUP {
        int id PK
        string code UK
        string name
        string description
    }

    ITEM {
        int id PK
        string code UK
        string name
        string spec
        string unit
        int item_group_id FK
        decimal min_stock
        decimal max_stock
        boolean is_active
    }

    SUPPLIER {
        int id PK
        string code UK
        string name
        string tax_code
        string address
        string contact_person
        string phone
        string email
        boolean is_active
    }

    WAREHOUSE {
        int id PK
        string code UK
        string name
        string address
    }

    ZONE {
        int id PK
        int warehouse_id FK
        string code
        string name
    }

    RACK {
        int id PK
        int zone_id FK
        string code
    }

    STORAGE_LOCATION {
        int id PK
        int rack_id FK
        string code
        decimal max_capacity
    }

    LOT {
        int id PK
        int item_id FK
        string lot_code
        string color
        string size
        date manufacture_date
        date expiry_date
        int supplier_id FK
        enum qc_status
    }
```

## Ghi chú

- Mọi bảng đều có thêm `created_at`, `updated_at`, `created_by`, `updated_by` (nullable, chưa FK), `deleted_at` (soft delete) — không vẽ trong sơ đồ trên để đỡ rối.
- `qc_status` là enum dùng chung với module QC sau này: `PENDING`, `IN_PROGRESS`, `PASSED`, `FAILED`, `PARTIALLY_PASSED`, `PENDING_DISPOSITION`.
- `StorageLocation` hiện chưa có quan hệ trực tiếp với `Lot` trong module này (việc gán lô vào vị trí cụ thể thuộc phạm vi module Nhập/Xuất kho sau này).
- Unique composite: `Zone(warehouse_id, code)`, `Rack(zone_id, code)`, `StorageLocation(rack_id, code)`, `Lot(item_id, lot_code)`.
