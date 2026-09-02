# Kho NPL — Backend (Module 1: Danh mục & Master Data + Auth/RBAC)

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

## 1.5. Cập nhật 29/08/2026 — Đã thêm Auth/RBAC

Dựa trên phản hồi của Sếp về nghiệp vụ (xem `phan-tich-phan-hoi-sep.md`), đã bổ sung:

- **Auth/RBAC**: `Department`, `User`, enum `Role` (`ADMIN`, `WAREHOUSE_STAFF`, `DEPT_HEAD`, `BOD`, `QC_MANAGER`, `REQUESTER`). Đăng ký/đăng nhập bằng JWT (`@nestjs/jwt` + `passport-jwt`), mật khẩu hash bằng `bcrypt`.
- **Zone.zoneType** (`NORMAL` / `QUARANTINE`) — đánh dấu khu cách ly hàng lỗi (câu hỏi 20).
- **Lot.poNumber / packingListNumber / invoiceNumber** — theo dõi lô hàng theo PO/Packing List/Invoice (câu hỏi 8).
- **Seed data**: `prisma/seed.ts` tạo sẵn 8 phòng ban (RM_WAREHOUSE, COLOR_KITCHEN, FG_WAREHOUSE, PMC, CS, FD, QA, BOD) + 1 tài khoản admin mặc định.
- **Ví dụ áp dụng RBAC**: `ItemController` đã gắn `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` làm mẫu — áp dụng tương tự cho các controller còn lại (ItemGroup, Supplier, Warehouse, Zone, Rack, StorageLocation, Lot) khi cần.

**Việc cần làm sau khi migrate:**
```bash
npm run prisma:seed
```
Đăng nhập thử với tài khoản admin mặc định (email/password trong `.env`, đổi ngay sau lần đăng nhập đầu).

**Endpoint Auth:**
| Method | Path | Ghi chú |
|---|---|---|
| POST | `/api/auth/register` | Tạo user mới — **đã khóa, chỉ ADMIN đã đăng nhập mới gọi được** (cần header `Authorization: Bearer <token>` của tài khoản ADMIN) |
| POST | `/api/auth/login` | Đăng nhập, trả về `accessToken` (JWT) |
| GET | `/api/auth/me` | Lấy thông tin user hiện tại (cần Bearer token) |

**Tài khoản ADMIN đầu tiên** được tạo qua `npm run prisma:seed` (ghi thẳng vào DB, không qua endpoint `/register`) — vì `/register` giờ đòi hỏi đã có ADMIN đăng nhập trước, cần một "hạt giống" ban đầu để phá vòng lặp này.

**Cách gọi API cần xác thực:** thêm header `Authorization: Bearer <accessToken>`.

## 1.6. Cập nhật 31/08/2026 — Module 2: Nhập kho RM

**Luồng trạng thái** (`GoodsReceiptStatus`):
```
DRAFT (thủ kho tạo, kiểm đếm, sửa thoải mái)
  → PENDING_APPROVAL (gửi duyệt)
    → CONFIRMED (Trưởng bộ phận/Admin duyệt → tự tạo Lot + ghi StockLedgerEntry cộng tồn)
    → REJECTED (từ chối, có lý do) → reopen → về lại DRAFT để sửa
```

**Entity mới:**
- `GoodsReceipt` — phiếu nhập, mã tự sinh dạng `GRN-{năm}-{id}`, liên kết PO/Packing List/Invoice
- `GoodsReceiptLine` — từng dòng hàng (vật tư, số lượng kiểm đếm, mã lô, vị trí lưu)
- `StockLedgerEntry` — sổ cái tồn kho dùng chung toàn hệ thống, `quantity` **có dấu** (dương = cộng tồn, âm = trừ tồn) để sau này tính số dư chỉ cần `SUM()`, không cần logic riêng theo loại giao dịch
- `Warehouse` được gắn thêm `departmentId` — dùng để tự động chặn user sai phòng ban thao tác nhầm kho khác

**Cơ chế bảo mật 2 lớp:**
1. `RolesGuard` chặn theo **role** (VD: chỉ `DEPT_HEAD`/`ADMIN` được gọi `/approve`)
2. Service tự kiểm tra thêm theo **phòng ban** (VD: Trưởng bộ phận Color Kitchen không duyệt được phiếu của kho RM, dù đúng role `DEPT_HEAD`)

**Endpoint:**
| Method | Path | Role | Ghi chú |
|---|---|---|---|
| POST | `/api/goods-receipts` | ADMIN, WAREHOUSE_STAFF | Tạo phiếu DRAFT |
| GET | `/api/goods-receipts` | Ai đã đăng nhập | List, filter `warehouseId`/`status` |
| GET | `/api/goods-receipts/:id` | Ai đã đăng nhập | Chi tiết kèm dòng hàng |
| PUT | `/api/goods-receipts/:id` | ADMIN, WAREHOUSE_STAFF | Chỉ sửa được khi DRAFT |
| POST | `/api/goods-receipts/:id/submit` | ADMIN, WAREHOUSE_STAFF | DRAFT → PENDING_APPROVAL |
| POST | `/api/goods-receipts/:id/approve` | ADMIN, DEPT_HEAD | PENDING_APPROVAL → CONFIRMED |
| POST | `/api/goods-receipts/:id/reject` | ADMIN, DEPT_HEAD | PENDING_APPROVAL → REJECTED (kèm `reason`) |
| POST | `/api/goods-receipts/:id/reopen` | ADMIN, WAREHOUSE_STAFF | REJECTED → DRAFT |
| DELETE | `/api/goods-receipts/:id` | ADMIN, WAREHOUSE_STAFF | Chỉ xóa được khi DRAFT |

**Seed đã cập nhật**: tự tạo sẵn 3 kho (RM_WAREHOUSE, COLOR_KITCHEN, FG_WAREHOUSE) gắn đúng phòng ban tương ứng — chạy lại `npm run prisma:seed` sau khi migrate để có sẵn data test.

## 1.7. Cập nhật 31/08/2026 — Module 3: QC (Kiểm tra chất lượng)

**Phát hiện quan trọng**: enum `qc_status` có sẵn từ Module 1 **khớp chính xác** với 3 đáp án nghiệp vụ của Thành khi hàng không đạt — không cần tạo enum mới:
| Giá trị DB | Ngôn ngữ nghiệp vụ |
|---|---|
| `PASSED` | Đạt |
| `FAILED` | Rejected (Không đạt) |
| `PARTIALLY_PASSED` | Marginal Accepted (Đạt có điều kiện) |
| `PENDING_DISPOSITION` | Pending — dành cho module xử lý hàng lỗi sau này quyết định hủy/trả NCC, **không phải kết quả QC trực tiếp** |

**Luồng trạng thái phiếu kiểm** (`QcInspectionStatus`, tách riêng khỏi *kết quả* kiểm):
```
DRAFT (nhân viên tạo, chụp ảnh, chọn kết quả sơ bộ)
  → PENDING_APPROVAL (gửi duyệt — bắt buộc đã có kết quả + ít nhất 1 ảnh)
    → APPROVED (QC Manager duyệt → cập nhật Lot.qcStatus thật)
    → REJECTED (từ chối quy trình, VD ảnh mờ) → reopen → DRAFT
```

**Tính năng upload ảnh** — hoàn toàn mới, dùng Multer lưu file trên đĩa cục bộ:
- Thư mục lưu: `uploads/qc-inspections/` (ngoài code, **đã thêm vào `.gitignore`** — không commit ảnh vào Git)
- Giới hạn: chỉ nhận JPEG/PNG/WEBP, tối đa 5MB/ảnh
- **Lưu ý khi build PC on-premise**: thư mục `uploads/` này cần được backup riêng (không nằm trong scope backup database) — nên trỏ ra ổ đĩa/NAS riêng có backup, tách khỏi thư mục code để tránh mất ảnh khi deploy lại code.
- **Nếu sau này chuyển sang hosting cloud có filesystem tạm thời** (ephemeral, VD Render free tier) — ảnh sẽ mất khi redeploy, cần chuyển sang Supabase Storage/S3. Không phải vấn đề với phương án on-premise hiện tại.

**Endpoint:**
| Method | Path | Role | Ghi chú |
|---|---|---|---|
| POST | `/api/qc-inspections` | ADMIN, WAREHOUSE_STAFF, QC_MANAGER | Tạo phiếu DRAFT, tự chuyển Lot sang `IN_PROGRESS` |
| GET | `/api/qc-inspections` | Ai đã đăng nhập | List, filter `lotId`/`status` |
| GET | `/api/qc-inspections/:id` | Ai đã đăng nhập | Chi tiết kèm ảnh |
| PUT | `/api/qc-inspections/:id` | ADMIN, WAREHOUSE_STAFF, QC_MANAGER | Chỉ sửa được khi DRAFT |
| POST | `/api/qc-inspections/:id/images` | ADMIN, WAREHOUSE_STAFF, QC_MANAGER | Upload 1 ảnh (multipart/form-data, field `file`), gọi nhiều lần cho nhiều ảnh |
| GET | `/api/qc-inspections/images/:imageId/file` | Ai đã đăng nhập | Xem/tải ảnh |
| DELETE | `/api/qc-inspections/images/:imageId` | ADMIN, WAREHOUSE_STAFF, QC_MANAGER | Xóa ảnh (chỉ khi DRAFT) |
| POST | `/api/qc-inspections/:id/submit` | ADMIN, WAREHOUSE_STAFF, QC_MANAGER | DRAFT → PENDING_APPROVAL (bắt buộc đã có kết quả + ảnh) |
| POST | `/api/qc-inspections/:id/approve` | ADMIN, QC_MANAGER | PENDING_APPROVAL → APPROVED, cập nhật Lot.qcStatus |
| POST | `/api/qc-inspections/:id/reject` | ADMIN, QC_MANAGER | PENDING_APPROVAL → REJECTED (kèm `reason`) |
| POST | `/api/qc-inspections/:id/reopen` | ADMIN, WAREHOUSE_STAFF, QC_MANAGER | REJECTED → DRAFT |
| DELETE | `/api/qc-inspections/:id` | ADMIN, WAREHOUSE_STAFF, QC_MANAGER | Chỉ xóa được khi DRAFT |

**Test upload ảnh qua PowerShell** (curl/Postman dễ hơn Invoke-RestMethod cho multipart):
```powershell
curl.exe -X POST "http://localhost:3000/api/qc-inspections/1/images" -H "Authorization: Bearer $token" -F "file=@C:\duong-dan\anh-test.jpg"
```

## 1.8. Cập nhật 31/08/2026 — Module Xuất kho (IssueRequest): luồng duyệt đa cấp

**Luồng trạng thái** (`IssueRequestStatus`):
```
DRAFT (bất kỳ ai tạo, kể cả phòng ban khác — REQUESTER role)
  → PENDING_HEAD_APPROVAL (gửi duyệt)
    → PENDING_BOD_APPROVAL (Trưởng bộ phận CỦA NGƯỜI YÊU CẦU duyệt)
      → APPROVED (BOD duyệt cuối)
        → ISSUED (thủ kho thực xuất → tự động phân bổ FEFO, trừ tồn kho)
    → REJECTED (từ chối ở bất kỳ cấp nào) → reopen → DRAFT
```

**Điểm khác biệt quan trọng so với Module 2:**
- **Không giới hạn ai tạo được** — mọi role (kể cả `REQUESTER` từ phòng ban khác) đều tạo được phiếu, đúng yêu cầu "phòng ban khác chỉ tạo phiếu yêu cầu"
- **Trưởng bộ phận duyệt theo phòng ban CỦA NGƯỜI YÊU CẦU** (không phải phòng ban quản lý kho như Module 2) — vì đây là "sếp của người xin hàng" duyệt, không phải "sếp quản lý kho xuất hàng"
- **Chỉ chủ phiếu (hoặc ADMIN) được sửa/gửi/xóa/mở lại** — kiểm tra qua `requesterId`, không phải qua RBAC role
- **FEFO tự động** (First-Expired-First-Out): khi thực xuất, hệ thống tự động ưu tiên lấy từ lô hết hạn sớm nhất trước, có thể **chia nhỏ qua nhiều lô** nếu 1 lô không đủ
- **Chỉ xuất được Lot đã `PASSED` hoặc `PARTIALLY_PASSED` QC** — tích hợp trực tiếp với Module 3, hàng chưa QC/không đạt/đang chờ xử lý không xuất được
- **Xuất một phần (partial issue) hợp lệ** — nếu tổng tồn khả dụng không đủ, hệ thống xuất hết phần có thể, ghi `issuedQuantity < requestedQuantity`, **không báo lỗi** (đúng yêu cầu "vẫn xuất được phần còn lại")

**Endpoint:**
| Method | Path | Ai được gọi | Ghi chú |
|---|---|---|---|
| POST | `/api/issue-requests` | Ai đã đăng nhập | Tạo phiếu DRAFT |
| GET | `/api/issue-requests` | Ai đã đăng nhập | List, filter `warehouseId`/`status`/`requesterId` |
| GET | `/api/issue-requests/:id` | Ai đã đăng nhập | Chi tiết |
| PUT | `/api/issue-requests/:id` | Chủ phiếu/ADMIN | Chỉ khi DRAFT |
| POST | `/api/issue-requests/:id/submit` | Chủ phiếu/ADMIN | DRAFT → PENDING_HEAD_APPROVAL |
| POST | `/api/issue-requests/:id/approve-head` | DEPT_HEAD (cùng phòng ban)/ADMIN | → PENDING_BOD_APPROVAL |
| POST | `/api/issue-requests/:id/approve-bod` | BOD/ADMIN | → APPROVED |
| POST | `/api/issue-requests/:id/reject` | DEPT_HEAD hoặc BOD (đúng cấp đang chờ)/ADMIN | → REJECTED (kèm `reason`) |
| POST | `/api/issue-requests/:id/reopen` | Chủ phiếu/ADMIN | REJECTED → DRAFT |
| POST | `/api/issue-requests/:id/issue` | WAREHOUSE_STAFF (đúng phòng ban kho)/ADMIN | APPROVED → ISSUED, tự trừ tồn kho FEFO |
| DELETE | `/api/issue-requests/:id` | Chủ phiếu/ADMIN | Chỉ khi DRAFT |

**Lưu ý quan trọng khi test**: cần có sẵn Lot với `qcStatus = PASSED` hoặc `PARTIALLY_PASSED` (từ Module 2 + Module 3) trước khi test `issue` — nếu chưa QC hoặc QC chưa duyệt, `issuedQuantity` sẽ luôn = 0.

## 1.9. Cập nhật 31/08/2026 — Swagger UI (demo trực quan qua trình duyệt)

Đã tích hợp **Swagger UI** để demo/test API trực tiếp qua trình duyệt, không cần Postman/curl.

**Truy cập**: sau khi `npm run start:dev`, mở trình duyệt:
```
http://localhost:3000/api/docs
```

**Cách test API cần đăng nhập trên Swagger UI:**
1. Mở endpoint `POST /auth/login`, bấm "Try it out", nhập email/password, Execute
2. Copy giá trị `accessToken` trong response (không copy dấu ngoặc kép)
3. Bấm nút **"Authorize"** ở góc trên bên phải trang
4. Dán `accessToken` vào ô (không cần gõ thêm chữ "Bearer", Swagger tự thêm)
5. Bấm "Authorize" → "Close"
6. Giờ có thể "Try it out" bất kỳ endpoint nào cần đăng nhập, token tự động đính kèm

**Cấu trúc trang**: các API được nhóm theo module (tag) để dễ tìm khi demo — "Nhập kho (Module 2)", "QC - Kiểm tra chất lượng (Module 3)", "Xuất kho (duyệt đa cấp)", "Xác thực (Auth)"...

**Lưu ý về scope demo**: Swagger UI là công cụ dành cho dev/demo kỹ thuật, **không phải giao diện người dùng cuối**. Phù hợp để chứng minh logic nghiệp vụ hoạt động đúng (bấm nút, thấy kết quả ngay), nhưng nếu công ty quyết định tiếp tục dự án sau demo, cần đầu tư làm giao diện thật (web/mobile) cho nhân viên dùng hàng ngày.

## 1.10. Cập nhật 31/08/2026 — Giao diện web demo (HTML/CSS/JS thuần)

Đã thêm giao diện web thật (không phải Swagger) để demo trực quan hơn cho Thành — form nhập liệu, bảng danh sách, nút bấm theo đúng luồng nghiệp vụ thay vì JSON thô.

**Kiến trúc**: HTML/CSS/JavaScript thuần (không React, không build tool), được NestJS phục vụ trực tiếp qua `@nestjs/serve-static` — **chỉ cần 1 lệnh `npm run start:dev`**, không cần chạy 2 server riêng.

**Truy cập**: `http://localhost:3000` (tự động vào trang đăng nhập)

**Phạm vi**: chỉ bao gồm 3 màn hình chính khớp với luồng demo — **Nhập kho**, **QC**, **Xuất kho**. Các màn hình quản lý danh mục (Vật tư, Nhà cung cấp, Kho...) chưa có giao diện riêng, vẫn tạo qua Swagger (`/api/docs`) — quyết định có chủ đích để không phá vỡ deadline demo tháng 10, có thể mở rộng sau.

**Cấu trúc file:**
```
web/
├── index.html              — Đăng nhập
├── dashboard.html          — Trang chủ, điều hướng 3 module
├── goods-receipts.html     — Nhập kho (list + tạo phiếu + chi tiết/duyệt)
├── qc-inspections.html     — QC (list + tạo phiếu + upload ảnh + duyệt)
├── issue-requests.html     — Xuất kho (list + tạo + duyệt đa cấp + thực xuất)
├── css/style.css           — Giao diện dùng chung
└── js/
    ├── api.js              — Helper gọi API, quản lý token đăng nhập
    ├── goods-receipts.js
    ├── qc-inspections.js
    └── issue-requests.js
```

**Điểm kỹ thuật đáng chú ý:**
- Token JWT lưu ở `localStorage` trình duyệt — bình thường và an toàn cho 1 web app thật chạy trên máy người dùng (khác với "artifact" preview trong Claude, nơi `localStorage` bị cấm dùng)
- Ảnh QC hiển thị qua `fetch` + `Blob` thay vì `<img src="...">` trực tiếp — vì endpoint ảnh yêu cầu token xác thực, mà thẻ `<img>` không tự gửi kèm header được
- Mỗi trang đều có "thanh tiến trình" trực quan (Xuất kho) hoặc badge màu theo trạng thái, giúp Thành nhìn là hiểu ngay đang ở bước nào

**Việc cần làm khi merge:**
- Copy thêm thư mục `web/` hoàn toàn mới vào project (nằm ngang hàng với `src/`, `prisma/`)
- `npm install` để cài `@nestjs/serve-static`
- Không cần migrate gì thêm (không đổi schema)

## 1.11. Cập nhật 31/08/2026 — Module Điều chuyển kho + vá lỗi tính tồn kho

**Bối cảnh**: làm trong 3 ngày nghỉ lễ còn lại, ưu tiên các phần hoàn toàn không phụ thuộc 5 câu hỏi đang chờ Thành trả lời.

### Module Điều chuyển kho (WarehouseTransfer)

**Luồng trạng thái** (2 bên xác nhận, không cần duyệt đa cấp — Thành chưa yêu cầu):
```
DRAFT (kho nguồn tạo, chọn Lot + số lượng cụ thể)
  → SHIPPED (kho nguồn xác nhận xuất — hàng vào kho trung chuyển ảo)
    → RECEIVED (kho đích xác nhận nhận — hàng chính thức vào kho đích)
```

**Cơ chế "không mất hàng giữa chừng"**: dùng 1 `Warehouse` ảo có `code: "IN_TRANSIT"` (đã thêm vào `seed.ts`, không gán phòng ban quản lý) làm điểm trung gian:
- `SHIPPED`: trừ tồn kho nguồn (`TRANSFER_OUT`) + cộng tồn kho trung chuyển (`TRANSFER_IN`)
- `RECEIVED`: trừ tồn kho trung chuyển (`TRANSFER_OUT`) + cộng tồn kho đích (`TRANSFER_IN`)

Tại bất kỳ thời điểm nào, tổng tồn kho toàn hệ thống luôn khớp — tái sử dụng đúng 2 enum `TRANSFER_IN`/`TRANSFER_OUT` đã định nghĩa sẵn từ Module 2.

**Phân quyền khác biệt quan trọng**: `ship` yêu cầu thủ kho **kho nguồn**, `receive` yêu cầu thủ kho **kho đích** — 2 chiều kiểm tra khác nhau, không dùng chung 1 helper.

**Endpoint:**
| Method | Path | Ai được gọi |
|---|---|---|
| POST | `/api/warehouse-transfers` | ADMIN, WAREHOUSE_STAFF (đúng phòng ban kho nguồn) |
| POST | `/api/warehouse-transfers/:id/ship` | WAREHOUSE_STAFF kho **nguồn**/ADMIN |
| POST | `/api/warehouse-transfers/:id/receive` | WAREHOUSE_STAFF kho **đích**/ADMIN |

### 🐛 Lỗi đã phát hiện và vá: tính tồn kho không theo đúng từng kho

**Vấn đề**: `IssueRequestService` (module Xuất kho) trước đây tính tồn khả dụng của 1 lô hàng **gộp trên toàn hệ thống**, không lọc riêng theo kho đang xuất. Vì từ đầu dự án tới giờ chỉ thao tác trên 1 kho (RM) nên lỗi này chưa từng lộ ra — nhưng ngay khi có Điều chuyển kho, 1 lô hàng có thể tồn tại ở nhiều kho cùng lúc, dẫn tới nguy cơ tính nhầm tồn từ kho khác khi xuất.

**Đã sửa**: thêm hàm `getLotAvailableQuantityInWarehouse()` tính tồn **đúng theo từng kho cụ thể**, thay cho hàm cũ tính gộp. Đã thêm test case riêng (`chi tinh ton trong DUNG KHO dang xuat...`) xác nhận lỗi này không còn tái diễn.

## 1.12. Cập nhật 31/08/2026 — Sổ cái tồn kho + Xuất báo cáo Excel

**Bối cảnh**: Ngày 2 của kế hoạch 3 ngày nghỉ lễ. `StockLedgerEntry` đã có nền tảng từ Module 2, nhưng chưa có API tra cứu/báo cáo. Đây cũng chính là yêu cầu "phải xuất được báo cáo Excel" mà Thành đã xác nhận từ đầu dự án.

**3 nhóm chức năng (module `stock-ledger`, chỉ đọc — không sửa/xóa gì):**

1. **Tồn kho hiện tại theo Item + Kho** — `GET /stock-ledger/balance` — gộp tất cả lô của 1 vật tư trong 1 kho, mặc định ẩn dòng tồn = 0 (dùng `?includeZero=true` để hiện)
2. **Tồn kho theo từng Lô** — `GET /stock-ledger/balance-by-lot` — chi tiết hơn, biết chính xác lô nào còn bao nhiêu
3. **Lịch sử biến động** — `GET /stock-ledger/transactions` — xem từng giao dịch (nhập/xuất/chuyển kho/điều chỉnh), lọc theo vật tư/kho/lô/loại giao dịch/khoảng thời gian

**Xuất Excel** — dùng thư viện `exceljs`, đã tự kiểm tra độc lập (tạo file thật, đọc lại xác nhận không hỏng) trước khi giao:
- `GET /stock-ledger/balance/export` — file `.xlsx` tồn kho hiện tại
- `GET /stock-ledger/transactions/export` — file `.xlsx` lịch sử biến động (tối đa 10.000 dòng/lần xuất)

**Giao diện web mới**: `reports.html` — 2 tab (Tồn kho hiện tại / Lịch sử), có bộ lọc, nút "Xuất Excel" tải file trực tiếp qua trình duyệt.

**Bonus**: hoàn thiện luôn giao diện web cho Module Điều chuyển kho (`warehouse-transfers.html`) — Ngày 1 mới chỉ làm backend, nay đã có UI đầy đủ để demo trực quan.

## 1.13. Cập nhật 31/08/2026 — Module Kiểm kê + cơ chế khóa giao dịch

**Bối cảnh**: Ngày 3 (ngày cuối) của kế hoạch 3 ngày nghỉ lễ.

### Cơ chế khóa (`StocktakeLock`)

Đúng quyết định kiến trúc đã chốt từ đầu dự án: khi 1 kho đang được kiểm kê, **mọi giao dịch làm thay đổi tồn kho của kho đó đều bị chặn** cho tới khi kiểm kê hoàn tất/hủy.

Đã thêm hàm dùng chung `assertNoActiveStocktakeLock()` (`src/common/stocktake-lock.util.ts`), và **gắn vào đúng 3 điểm** trong 3 module đã có sẵn:
- `GoodsReceiptService.approve()`
- `IssueRequestService.issue()`
- `WarehouseTransferService.ship()` và `receive()`

Mỗi chỗ chỉ thêm 1 dòng kiểm tra ngay đầu transaction — không đổi logic cũ.

### Luồng kiểm kê

```
IN_PROGRESS (bắt đầu — chụp nhanh tồn hiện tại theo từng lô, khóa kho)
  → nhập số đếm thực tế từng dòng
  → COMPLETED (nếu trong dung sai — tự ghi điều chỉnh tồn kho + mở khóa)
  → CANCELLED (hủy — không ghi gì, mở khóa lại)
```

Nếu **vượt dung sai**: bị chặn hoàn tất bình thường, liệt kê rõ dòng nào lệch bao nhiêu %. Cần `ADMIN` dùng `forceComplete` kèm lý do để ghi đè.

### Dung sai — thiết kế chờ câu trả lời của Thành

Thêm `Warehouse.stocktakeTolerancePercent` (mặc định **0%** — không cho phép chênh lệch, áp dụng mọi kho). Khi có con số cụ thể cho Color Kitchen, chỉ cần **sửa giá trị này qua `PUT /warehouses/:id`**, không cần sửa code hay migrate lại.

**Endpoint:**
| Method | Path | Ghi chú |
|---|---|---|
| POST | `/api/stocktakes` | Bắt đầu kiểm kê 1 kho |
| PUT | `/api/stocktakes/:id/lines/:lineId` | Nhập số đếm thực tế |
| POST | `/api/stocktakes/:id/complete` | Hoàn tất (chặn nếu vượt dung sai) |
| POST | `/api/stocktakes/:id/force-complete` | ADMIN ghi đè, bắt buộc có lý do |
| POST | `/api/stocktakes/:id/cancel` | Hủy, không ghi điều chỉnh gì |

**Lưu ý phạm vi**: module này **chưa có giao diện web riêng** (chỉ dùng được qua Swagger `/api/docs`) — quyết định có chủ đích để giữ chất lượng ổn định trong ngày cuối, có thể bổ sung giao diện sau nếu cần cho demo.

## 1.14. Cập nhật 01/09/2026 — Quét QR kiểm kê bằng điện thoại + vá lỗ hổng bảo mật

### 🚨 Vá lỗ hổng bảo mật quan trọng (phát hiện tình cờ khi làm QR)

**7 controller Module 1 (ItemGroup, Supplier, Warehouse, Zone, Rack, StorageLocation, Lot) hoàn toàn KHÔNG có `@UseGuards`** — sót lại từ trước khi Auth được xây (chỉ `ItemController` được làm mẫu retrofit lúc đó, 7 cái còn lại chưa bao giờ được vá). Nghĩa là **ai cũng gọi được API này mà không cần đăng nhập** — rủi ro nghiêm trọng vì app đang mở public qua ngrok cho demo.

**Đã vá toàn bộ 7 controller**, đúng pattern: `JwtAuthGuard + RolesGuard` ở cấp controller, `@Roles(ADMIN, WAREHOUSE_STAFF)` cho POST/PUT/DELETE, GET mở cho mọi role đã đăng nhập.

### Tính năng mới — Quét QR kiểm kê

**Ý tưởng**: mỗi Lot có 1 mã QR mã hóa `KHO-LOT-{id}` (không mã hóa URL đầy đủ — vì địa chỉ truy cập app có thể đổi theo thời gian, trong khi tem đã dán lên hàng có thể tồn tại nhiều tháng). In tem này dán lên hàng thật; lúc kiểm kê, thủ kho dùng điện thoại quét tem thay vì gõ tay tìm lô hàng.

**Backend:**
| Endpoint | Chức năng |
|---|---|
| `GET /api/lots/:id/qrcode` | Trả về ảnh PNG mã QR của lô hàng |
| `GET /api/stocktakes/find-line-by-lot?lotId=X` | Tra cứu dòng kiểm kê đang mở tương ứng với lô vừa quét |

**Frontend:**
- `stocktake-scan.html` — trang tối ưu cho điện thoại, dùng camera quét qua thư viện `html5-qrcode` (CDN, không cần cài app). Quét xong tự hiện tên vật tư + tồn hệ thống, nhập số đếm, xác nhận xong camera tự bật lại quét tiếp — không cần thao tác thừa giữa các lần quét. Có lối vào thủ công (nhập ID) khi không quét được (tem hỏng, đèn yếu...).
- Nút "Xem QR" trong trang Nhập kho — mở ảnh QR trong tab mới để in ngay sau khi lô hàng được tạo.

**Đã tự kiểm tra `qrcode`**: tạo ảnh thật rồi **giải mã ngược** bằng `jsqr` xác nhận nội dung khớp 100% trước khi đưa vào code — không chỉ tin suông.

**Cách dùng thực tế:**
1. Sau khi duyệt phiếu nhập kho, vào chi tiết phiếu → bấm "Xem QR" từng dòng → in tem dán lên hàng
2. Lúc kiểm kê: mở `http://<địa-chỉ-app>/stocktake-scan.html` trên điện thoại (lưu bookmark), bắt đầu phiên kiểm kê trước qua Swagger/desktop, rồi dùng điện thoại quét lần lượt từng tem

## 1.15. Cập nhật 01/09/2026 — Health Check tự động hàng ngày (giữ Render/Supabase free luôn "thức")

### Vấn đề cần giải quyết

Dùng **Render free** (ngủ sau 15 phút không ai dùng) + **Supabase free** (tự pause sau 7 ngày không có hoạt động database) cho demo — nếu Thành và các sếp khác demo cách nhau nhiều ngày, người demo sau có thể gặp app lỗi hoàn toàn, phải chờ Nguyên vào khôi phục thủ công.

### Giải pháp — GitHub Actions chạy tác vụ hàng ngày lúc 2h sáng (giờ VN)

**Không dùng lịch hẹn giờ bên trong app** (`@nestjs/schedule`) — vì lúc Render free đang "ngủ", toàn bộ tiến trình app bị tắt, lịch hẹn giờ bên trong cũng chết theo. Phải đánh thức **từ bên ngoài**.

**Cơ chế**: GitHub Actions (miễn phí, đã có sẵn từ lúc setup Git) tự động gọi vào app lúc 2h sáng mỗi ngày, chạy trọn vẹn 1 luồng nghiệp vụ thật (Nhập kho → QC → Xuất kho có duyệt), sau đó gửi email báo cáo.

**Lợi ích kép:**
1. Request thật + ghi dữ liệu thật vào DB → Render hết ngủ, Supabase không bị tính "không hoạt động"
2. Tự phát hiện sớm nếu có lỗi triển khai (migration thiếu, biến môi trường sai...) — nhận email biết ngay, không cần đợi ai đó demo mới phát hiện ra app hỏng

### Cô lập hoàn toàn khỏi dữ liệu demo thật

Toàn bộ luồng test chạy trên **1 kho riêng biệt `SYSTEM_TEST`** (tạo qua `prisma/seed-system-test.ts`, giống cách làm kho ảo `IN_TRANSIT`) + 1 tài khoản bot riêng `system.healthcheck@sec.com` — **không bao giờ đụng tới 3 kho thật** (RM/Color Kitchen/FG). Thành xem báo cáo/Excel bình thường sẽ **không bao giờ thấy** dữ liệu test này lẫn vào.

Đã vá luôn 1 lỗ hổng giao diện có sẵn từ trước (chưa ai để ý): dropdown chọn kho ở trang Nhập kho/Xuất kho **chưa lọc kho ảo** (`IN_TRANSIT`) ra khỏi danh sách — nay lọc luôn cả `IN_TRANSIT` và `SYSTEM_TEST`.

### Phạm vi kiểm tra tự động — có chủ đích bỏ qua 2 module

**Không test Điều chuyển kho** (cần 2 kho thật khác nhau, kho test chỉ có 1) và **Kiểm kê** (có cơ chế khóa giao dịch — nếu test tự động lỡ khóa nhầm lúc có người đang kiểm kê thật thì hại nhiều hơn lợi).

### Cách setup (làm 1 lần)

**1. Tạo dữ liệu hệ thống** (chạy trên máy có kết nối Supabase):
```bash
SYSTEM_HEALTHCHECK_PASSWORD="mat-khau-manh-cua-ban" npx ts-node prisma/seed-system-test.ts
```
Ghi lại 3 số ID được in ra cuối cùng (`SYSTEM_TEST_WAREHOUSE_ID`, `HEALTHCHECK_ITEM_ID`, `HEALTHCHECK_SUPPLIER_ID`).

**2. Tạo App Password cho Gmail** (dùng để gửi email, miễn phí):
- Bật xác thực 2 bước cho tài khoản Gmail
- Vào `myaccount.google.com/apppasswords` → tạo mật khẩu ứng dụng mới → copy lại

**3. Khai báo GitHub Secrets** (repo `QL-KHO` → Settings → Secrets and variables → Actions → New repository secret), thêm đủ 8 secret:

| Secret | Giá trị |
|---|---|
| `APP_URL` | Link Render sau khi deploy, VD `https://kho-npl.onrender.com` |
| `SYSTEM_HEALTHCHECK_PASSWORD` | Mật khẩu đã đặt ở bước 1 |
| `SYSTEM_TEST_WAREHOUSE_ID` | Số ID ghi lại ở bước 1 |
| `HEALTHCHECK_ITEM_ID` | Số ID ghi lại ở bước 1 |
| `HEALTHCHECK_SUPPLIER_ID` | Số ID ghi lại ở bước 1 |
| `REPORT_TO_EMAIL` | Email bạn muốn nhận báo cáo |
| `GMAIL_USER` | Địa chỉ Gmail dùng để gửi |
| `GMAIL_APP_PASSWORD` | App Password tạo ở bước 2 |

**4. Test thử ngay** (không cần chờ 2h sáng): vào tab **Actions** trên GitHub → chọn workflow "Daily Health Check" → **Run workflow** → chạy tay để xác nhận hoạt động đúng trước khi để tự động.

### Lưu ý về thời gian gửi báo cáo

Ban đầu có ý định tách "test lúc 2h sáng" và "gửi email lúc 7h sáng" thành 2 mốc riêng — nhưng vì cả 2 mốc đều là lúc bạn đang ngủ, kết quả trải nghiệm thực tế giống hệt nhau (email nằm sẵn trong hộp thư khi bạn thức dậy check). Nên đã **gộp làm 1** (test xong gửi email luôn lúc ~2h sáng) cho đơn giản. Nếu muốn tách thật ra 7h sáng, báo lại để làm phức tạp hơn (cần thêm 1 nơi lưu tạm kết quả giữa 2 lần chạy).

## 1.16. Cập nhật 01/09/2026 — Đa ngôn ngữ: Tiếng Việt / English / 中文

**Bối cảnh**: Công ty sử dụng 3 ngôn ngữ trong vận hành hàng ngày. Yêu cầu: toàn bộ hệ thống (giao diện web + thông báo lỗi + email báo cáo tự động) hỗ trợ cả 3, mặc định Tiếng Việt, có nút chuyển đổi tự do trên mỗi trang.

### Kiến trúc

**Frontend** — cơ chế nhẹ, không cần thư viện ngoài:
- 3 file từ điển JSON (`web/i18n/vi.json`, `en.json`, `zh.json`) — đã xác nhận cả 3 có **đúng bộ key giống hệt nhau**, không thiếu sót
- `web/js/i18n.js` — tải từ điển, hàm `t(key)` tra cứu, hàm `tStatus(code)` dịch riêng nhãn trạng thái, tự động dịch mọi phần tử có `data-i18n="..."`, nút chuyển đổi 3 ngôn ngữ (VI/EN/中文) lưu vào `localStorage` — **ai cũng tự bấm đổi được**, không gắn theo tài khoản
- `statusBadge()` (dùng chung mọi trang) nay hiện nhãn đã dịch thay vì mã enum thô (VD: "Chờ duyệt" thay vì "PENDING_APPROVAL")

**Backend** — dùng **Exception Filter toàn cục**, không sửa chữ ký hàm của service (giảm rủi ro phá vỡ code đang chạy đúng):
- `src/common/i18n/translations.ts` — từ điển thông báo lỗi + từ điển các "hành động" (duyệt, từ chối, xóa...)
- `src/common/i18n/i18n.util.ts` — hàm `translateMessage(key, lang, params)`, có **8 unit test chạy thật** (hiếm hoi không phụ thuộc Prisma nên tự kiểm chứng được ngay trong quá trình phát triển)
- `src/common/filters/i18n-exception.filter.ts` — bắt mọi lỗi được ném ra dạng `{ key, params }`, dịch theo header `Accept-Language` gửi từ client
- Client gửi kèm `Accept-Language: vi|en|zh` ở mọi request (đã có sẵn trong `apiFetch`, `apiUpload`; vừa bổ sung thêm cho `apiDownloadFile`)

**Email báo cáo tự động** (`daily-healthcheck.js`) — hiển thị song song cả 3 ngôn ngữ trong cùng 1 email (hợp lý vì chỉ gửi cho 1 người, không cần cơ chế chọn ngôn ngữ riêng).

### Phạm vi đã áp dụng đầy đủ

| Phần | Trạng thái |
|---|---|
| Đăng nhập | ✅ Đầy đủ |
| Dashboard | ✅ Đầy đủ |
| Nhập kho | ✅ Đầy đủ |
| QC | ✅ Đầy đủ |
| Xuất kho | ✅ Đầy đủ |
| Điều chuyển kho | ✅ Đầy đủ |
| Báo cáo | ✅ Đầy đủ |
| Quét QR Kiểm kê (trang di động) | ✅ Đầy đủ — có nút chuyển ngôn ngữ riêng vì trang này không dùng topbar chung |
| Thông báo lỗi — GoodsReceipt, QcInspection, IssueRequest | ✅ Đầy đủ |
| Email health check | ✅ Đầy đủ |

**Toàn bộ 8 trang giao diện web đã hỗ trợ đầy đủ 3 ngôn ngữ.** Tổng cộng 298 key dịch, xác nhận khớp tuyệt đối giữa `vi.json`/`en.json`/`zh.json` (không thiếu sót key nào) — kiểm tra tự động lại 1 lần nữa sau khi hoàn tất 5 trang cuối cùng, phát hiện và vá thêm 6 chỗ sót (thông báo validate trong JS chưa được dịch).

### Sự cố đã phát hiện và vá trong quá trình hoàn thiện

Hàm `renderTopbar()` (dùng chung mọi trang) ban đầu gọi thẳng `t()` và `renderLanguageSwitcher()` không kiểm tra tồn tại trước — nếu 1 trang nào đó lỡ chưa kịp tải `i18n.js`, cả trang sẽ bị crash (`ReferenceError`), không chỉ hiện sai ngôn ngữ như tưởng. Đã vá bằng `safeT()` — tự động dùng chữ tiếng Việt dự phòng nếu `i18n.js` chưa sẵn sàng, đảm bảo trang không bao giờ bị treo dù có thiếu sót gì ở nơi khác.

### 🐛 Lỗi đã phát hiện và vá trong quá trình hoàn tất

**Lỗi nghiêm trọng**: khi sửa `renderTopbar()` (dùng chung mọi trang) để gọi hàm `t()` và nút chuyển ngôn ngữ từ `i18n.js`, 5 trang chưa kịp cập nhật (khi đó) chưa tải `i18n.js` — khiến `renderTopbar()` gọi tới hàm không tồn tại, làm cả script bị dừng giữa chừng (không chỉ hiện sai ngôn ngữ, mà toàn bộ nội dung động của trang không tải được). Đã vá theo 2 lớp:
1. `renderTopbar()` và `statusBadge()` nay có **kiểm tra an toàn** (`typeof ... === "function"`), không bao giờ crash dù thiếu `i18n.js`
2. Hoàn tất áp dụng `i18n.js` cho toàn bộ 5 trang còn lại — không còn trang nào ở trạng thái dở dang

### Đã đổi tên 1 biến để tránh xung đột

Trong `warehouse-transfers.js`, vòng lặp `.map((t) => ...)` từng dùng `t` làm tên biến cục bộ — trùng tên với hàm dịch toàn cục `t()`, gây "shadow" (biến cục bộ che mất hàm toàn cục) làm mọi lời gọi `t("key")` bên trong vòng lặp đó bị lỗi. Đã đổi tên biến thành `t2` để tránh xung đột.

## 1.17. Cập nhật 01/09/2026 — Module Trợ giúp trong app (thay vì chatbot AI)

**Quyết định**: sau khi cân nhắc giữa module hướng dẫn tĩnh và chatbot AI, chọn module tĩnh — tận dụng được toàn bộ hạ tầng đa ngôn ngữ đã có, không phát sinh chi phí API, rủi ro trả lời sai gần như bằng 0.

**Nội dung**: biên soạn lại từ `huong-dan-demo.md` và `so-do-phan-quyen.md` thành 9 mục tra cứu nhanh: Bắt đầu, Nhập kho, QC, Xuất kho, Điều chuyển kho, Báo cáo, Quét QR, Phân quyền, Câu hỏi thường gặp — dịch đầy đủ 3 ngôn ngữ (thêm 31 key mới vào từ điển, tổng cộng nay là **329 key**, vẫn khớp tuyệt đối giữa `vi`/`en`/`zh`).

**Kỹ thuật đáng chú ý**: thêm hàm `tRaw(key)` vào `i18n.js` — khác với `t()` (chỉ trả về chuỗi), `tRaw()` lấy nguyên mảng/object từ từ điển, dùng để render danh sách bước hướng dẫn, bảng phân quyền, danh sách FAQ trực tiếp từ dữ liệu JSON thay vì phải gắn `data-i18n` cho từng dòng riêng lẻ trong HTML — giảm đáng kể số lượng thẻ cần gắn tay.

**Truy cập**: nút **❓** ở góc trên bên phải (topbar) trên mọi trang — bấm vào sẽ nhảy thẳng tới đúng mục liên quan tới trang đang xem (VD: đang ở trang QC, bấm ❓ sẽ nhảy thẳng tới mục "QC" trong Trợ giúp, không cần cuộn tìm). Cũng có ô riêng trên Dashboard.

## 1.18. Cập nhật 02/09/2026 — Hoàn thiện giao diện web Kiểm kê (không còn phụ thuộc Swagger)

**Bối cảnh**: Backend Kiểm kê đã hoàn thành từ lâu (khóa giao dịch, dung sai, FEFO snapshot...), nhưng chưa có giao diện web — phải thao tác qua Swagger. Nay đã có đầy đủ giao diện, đồng bộ phong cách với các module khác.

**Đã làm:**
- Trang mới `web/stocktake.html` + `web/js/stocktake.js` — danh sách phiên, tạo mới, nhập số đếm trực tiếp trên máy tính (bổ sung cho cách quét QR bằng điện thoại đã có), hoàn tất/hủy/ghi đè dung sai (Admin)
- Màu chênh lệch (xanh/đỏ) tính đúng theo % dung sai thật của từng kho, không so cứng bằng 0
- Chuyển toàn bộ 11 thông báo lỗi tiếng Việt cứng trong `StocktakeService` sang cơ chế dịch — nay **tất cả 4 module lõi** (GoodsReceipt, QcInspection, IssueRequest, Stocktake) đều dịch được lỗi đầy đủ 3 ngôn ngữ
- **Cải tiến Exception Filter**: trước đây khi dịch message sẽ làm mất các trường dữ liệu phụ đính kèm (VD: danh sách `outOfTolerance` khi vượt dung sai) — nay giữ nguyên đầy đủ, chỉ thay phần `message`
- Cập nhật module Trợ giúp: thêm mục "Kiểm kê" riêng, sửa lại mục "Quét QR" (bỏ câu đã lỗi thời "hiện chỉ tạo qua Swagger")
- Thêm liên kết vào menu chính (topbar) và Dashboard
- Thêm 39 key dịch mới + 1 unit test mới (kiểm tra dịch đúng khi có 2 tham số cùng lúc) — tổng 371 key, khớp tuyệt đối 3 ngôn ngữ, tổng 9 unit test i18n đều pass

**Giờ đây, module Kiểm kê là module cuối cùng có đầy đủ giao diện web** — không còn module nào phải thao tác qua Swagger nữa (trừ các màn hình quản lý danh mục nền tảng như Item/Supplier, vốn ít thay đổi và không nằm trong phạm vi demo nghiệp vụ chính).

## 1.19. Cập nhật 02/09/2026 — Mở rộng module Trợ giúp: Phân quyền chi tiết + Tài khoản Demo

**Thay đổi kỹ thuật đáng chú ý**: `help.js` trước đây chỉ hiển thị được **1 trong 3 kiểu nội dung** cho mỗi mục (danh sách bước / bảng vai trò / FAQ — dùng if/else loại trừ nhau). Đã sửa lại để **ghép nối được nhiều khối nội dung liên tiếp** trong cùng 1 mục — nhờ vậy mục "Phân quyền" giờ có **cả 2 bảng**: bảng vai trò (như cũ) + bảng mới "Quy tắc kiểm tra phòng ban theo từng module" (Nhập kho, QC, Xuất kho, Điều chuyển kho, Kiểm kê... mỗi module kiểm tra phòng ban theo tiêu chí khác nhau).

**Mục mới "Tài khoản Demo"** — liệt kê đủ 7 tài khoản (Admin + 6 vai trò) ngay trong app, không cần mở file Word riêng khi đang test đổi qua lại nhiều vai trò.

**Đã tự kiểm tra bằng cách chạy thật `renderSection()`** với dữ liệu thật (không chỉ tin cấu trúc JSON đúng) — xác nhận số lượng thẻ `<table>`/`<tr>` cân bằng đúng dự kiến, rồi **render ra ảnh thật bằng `wkhtmltoimage`** để xem trực quan trước khi giao (bắt được 1 lỗi hiển thị dấu tiếng Việt do file test tạm thiếu khai báo charset — xác nhận đây chỉ là lỗi file test, không phải lỗi code thật, vì `help.html` gốc đã khai báo UTF-8 đầy đủ).

Thêm 20 key dịch mới, tổng 377 key khớp tuyệt đối 3 ngôn ngữ.

## 1.20. Cập nhật 02/09/2026 — Bấm vào tên để xem "Tôi là ai, nhiệm vụ của tôi là gì"

**Ý tưởng**: khi nhiều người khác vai trò cùng test hệ thống, mỗi người chỉ cần biết "riêng tôi làm được gì" — không cần đọc cả bảng phân quyền đầy đủ.

**Đã làm**: tên người dùng ở góc trên bên phải (mọi trang) giờ **bấm được** — mở modal hiển thị Họ tên, Email, Phòng ban, Vai trò (đã dịch, VD "Thủ kho" thay vì chỉ "WAREHOUSE_STAFF"), và đoạn mô tả **nhiệm vụ cụ thể theo đúng vai trò đang đăng nhập** — kèm link tới bảng phân quyền đầy đủ trong Trợ giúp nếu cần xem thêm.

**Kỹ thuật**: không cần gọi thêm API — toàn bộ dữ liệu (kể cả `department`) đã có sẵn trong thông tin đăng nhập lưu ở trình duyệt. Thêm 18 key dịch mới (6 vai trò × nhãn + mô tả nhiệm vụ), tổng 396 key khớp tuyệt đối 3 ngôn ngữ.

**Đã tự kiểm tra bằng cách chạy thật hàm `showProfileModal()`** (không chỉ tin cấu trúc dữ liệu đúng) — mô phỏng đủ 2 trường hợp: vai trò Thủ kho (tiếng Việt) và vai trò Admin không có phòng ban (tiếng Anh, kiểm tra riêng trường hợp `department = null` hiển thị đúng dấu "—").

## 1.21. Cập nhật 02/09/2026 — Logo + số phiên bản trên trang Đăng nhập

**Ý tưởng bắt nguồn từ 1 tool nội bộ khác của công ty (IT Asset Inventory)** — có cùng logo S.E.C. + số phiên bản nhỏ hiển thị ngay dưới tên app trên màn hình đăng nhập.

**Đã làm:**
- Thêm logo S.E.C. lên đầu trang Đăng nhập (`web/images/logo.png`)
- Đổi cách đặt số phiên bản sang định dạng theo ngày: `2026.09.02.1` (thay vì `0.1.0` semantic version cũ) — dễ biết ngay bản đang chạy là mới hay cũ
- **Endpoint công khai mới** `GET /api/app-info` (không cần đăng nhập, vì trang login cần gọi được trước khi có token) — đọc trực tiếp `package.json` bằng `fs.readFileSync`, trả về `{ name, version }`
- Trang Đăng nhập tự gọi endpoint này lúc tải trang, hiển thị `v{version}` ngay dưới tiêu đề

**Lưu ý kỹ thuật quan trọng — vì sao không dùng `import ... from 'package.json'` (cách thường thấy)**: dự án này từng gặp sự cố nghiêm trọng nhiều lần khi sửa `tsconfig.json` (mất cả buổi debug lỗi deploy). Cách `import` trực tiếp file JSON đòi hỏi bật thêm `resolveJsonModule` trong `tsconfig.json` — để tránh động vào file này thêm 1 lần nữa, chọn cách đọc file bằng `fs.readFileSync` lúc chạy (runtime), không cần sửa bất kỳ cấu hình biên dịch nào.

**Cách cập nhật phiên bản cho các lần sau**: mở `package.json`, sửa trường `"version"` thành ngày hiện tại (VD: `"2026.09.15.1"`, tăng số cuối nếu deploy nhiều lần trong cùng ngày) — trang Đăng nhập sẽ tự động hiện đúng số mới sau khi deploy, không cần sửa gì thêm ở nơi khác.

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
