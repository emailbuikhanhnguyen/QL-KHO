# Module 1/6 — Danh mục & Master Data

Backend NestJS + Prisma + PostgreSQL cho phần Danh mục & Master Data của Hệ thống Quản lý Kho NPL.

> **Lưu ý về môi trường build code này**: Prisma cần tải engine binary từ `binaries.prisma.sh` khi chạy `prisma generate` / `prisma migrate`. Sandbox dùng để viết code này bị chặn domain đó (whitelist chỉ cho `registry.npmjs.org`, `github.com`, `archive.ubuntu.com`, ...), nên **chưa tự chạy được `npx prisma migrate dev` và bộ test ở đây**. Đây là hạn chế mạng của môi trường soạn code, không phải lỗi của schema/code. Máy dev bình thường hoặc CI (GitHub Actions) sẽ tải được engine này bình thường — chỉ cần chạy đúng các bước bên dưới. File `prisma/schema.sql` mình đính kèm là bản SQL tương đương tay để bạn tham khảo trước, nhưng **nguồn chuẩn để tạo migration thật sự vẫn là lệnh `prisma migrate dev`**.

## 1. Cấu trúc thư mục

```
backend/
├── prisma/
│   ├── schema.prisma        # nguồn duy nhất định nghĩa DB schema
│   └── schema.sql           # bản SQL tương đương (tham khảo)
├── docs/
│   └── erd.md               # ERD dạng mermaid
├── src/
│   ├── main.ts               # bootstrap, global ValidationPipe, prefix /api
│   ├── app.module.ts          # gắn tất cả feature module
│   ├── prisma/                # PrismaService dùng chung (Global module)
│   ├── common/
│   │   ├── dto/pagination-query.dto.ts
│   │   └── pagination.util.ts
│   └── modules/
│       ├── item-group/
│       ├── item/
│       ├── supplier/
│       ├── warehouse/
│       ├── zone/
│       ├── rack/
│       ├── storage-location/
│       └── lot/
│           each module có: *.module.ts, *.controller.ts, *.service.ts,
│           *.service.spec.ts (unit test), dto/create-*.dto.ts, dto/update-*.dto.ts
├── test/
│   ├── jest-e2e.json
│   ├── item.e2e-spec.ts      # integration test API Item (theo yêu cầu spec mục 6.4)
│   └── lot.e2e-spec.ts       # integration test API Lot (theo yêu cầu spec mục 6.4)
├── .env.example
├── package.json
└── tsconfig.json
```

## 2. Cách chạy migration

1. Cài dependency:
   ```bash
   npm install
   ```
2. Tạo file `.env` từ `.env.example`, điền `DATABASE_URL` (pooler, cổng 6543) và `DIRECT_URL` (direct, cổng 5432) lấy từ Supabase project settings → Database.
3. Sinh Prisma Client:
   ```bash
   npx prisma generate
   ```
4. Chạy migration (áp schema lên DB, tạo file migration trong `prisma/migrations/`):
   ```bash
   npx prisma migrate dev --name init
   ```
   - Lệnh này dùng `DIRECT_URL` (port 5432) như đã cấu hình trong `schema.prisma` (`directUrl`).
   - Khi deploy lên môi trường khác (staging/production), dùng `npx prisma migrate deploy` thay vì `migrate dev`.
5. Chạy app:
   ```bash
   npm run start:dev
   ```
   API sẽ chạy ở `http://localhost:3000/api/...`.

## 3. Cách chạy test

```bash
# Unit test (mock PrismaService, không cần DB)
npm test

# Integration test (cần DATABASE_URL trỏ tới DB thật — nên dùng DB test riêng, không dùng chung với dev/prod)
npm run test:e2e
```

- Unit test: `src/modules/**/*.service.spec.ts` — tập trung vào logic nghiệp vụ chính (validate min/max stock, check FK tồn tại, check trùng mã, soft delete, mặc định `qcStatus = PENDING`).
- Integration test: `test/item.e2e-spec.ts` và `test/lot.e2e-spec.ts` — gọi thật API qua supertest, kiểm tra CRUD + validate + soft delete + phân trang.

## 4. Naming convention (áp dụng cho toàn bộ các module sau)

- **Database** (bảng, cột): `snake_case`. Ví dụ: `item_groups`, `item_group_id`, `min_stock`.
- **Code** (class, property TypeScript): `camelCase`/`PascalCase`. Ví dụ: `ItemGroup`, `itemGroupId`, `minStock`.
- Prisma tự động map giữa 2 quy ước này qua `@map(...)` / `@@map(...)` trong `schema.prisma` — không cần code thủ công 2 lần.
- Tên file: `kebab-case` (`item-group.service.ts`), tên route REST: số nhiều, kebab-case (`/api/item-groups`, `/api/storage-locations`).

## 5. Ghi chú `created_by` / `updated_by`

- Hiện tại 2 cột này là `integer`, `nullable`, **không có FK ràng buộc**.
- Khi module Auth (users) được build, sẽ:
  1. Thêm FK `created_by → users.id`, `updated_by → users.id`.
  2. **Không đổi tên cột, không đổi kiểu dữ liệu** — chỉ thêm constraint FK bằng migration mới (`ALTER TABLE ... ADD CONSTRAINT ...`), tránh phải migrate lại toàn bộ schema hiện có.
- Ở tầng code hiện tại, các service đã có sẵn tham số nhận `createdBy` / `updatedBy` — controller có thể truyền vào khi có middleware Auth (hiện chưa gắn vì Auth chưa build).

## 6. API tổng quan

Tất cả entity đều có REST chuẩn dưới prefix `/api`, ví dụ với `Item`:

| Method | Path              | Ghi chú                                   |
|--------|-------------------|--------------------------------------------|
| GET    | `/api/items`       | List, hỗ trợ `?page=&limit=&search=` + filter riêng (`itemGroupId`, `isActive`) |
| GET    | `/api/items/:id`   | Chi tiết theo id                          |
| POST   | `/api/items`       | Tạo mới, validate đầy đủ qua class-validator |
| PUT    | `/api/items/:id`   | Cập nhật (partial update)                 |
| DELETE | `/api/items/:id`   | Soft delete (set `deleted_at`, không xóa cứng) |

Các entity khác (`item-groups`, `suppliers`, `warehouses`, `zones`, `racks`, `storage-locations`, `lots`) đều theo đúng pattern này. Riêng entity có FK (`Zone`, `Rack`, `StorageLocation`, `Item`, `Lot`) sẽ validate FK tồn tại trước khi tạo/sửa, và trả `400` nếu FK không hợp lệ, `409` nếu trùng mã unique trong phạm vi cha tương ứng.

`Lot` mặc định `qc_status = PENDING` khi tạo mới nếu không truyền, đúng theo enum dùng chung với module QC (mục 3 của spec).

## 7. Hạ tầng (tham khảo, không ảnh hưởng code)

- DB: Supabase Postgres — `DATABASE_URL` qua pooler PgBouncer (6543) cho app, `DIRECT_URL` (5432) riêng cho `prisma migrate`.
- Backend deploy trên Render (Web Service), build tự động mỗi lần push GitHub.
- CI (GitHub Actions) cho `npm test` sẽ được setup ở bước sau — hiện chỉ cần đảm bảo `npm test` chạy được local/CI runner.
