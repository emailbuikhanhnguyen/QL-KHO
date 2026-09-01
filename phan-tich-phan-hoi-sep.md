# Phân tích phản hồi của Sếp — Tác động đến Scope Dự án Kho NPL

**Ngày:** 29/08/2026
**Nguồn:** APP_answer_270826.xlsx — 24 câu hỏi xác nhận nghiệp vụ
**Deadline demo do Sếp đặt ra:** Tháng 10/2026 (~6 tuần kể từ hôm nay)

---

## 1. Tin tốt — Những gì Module 1 đã thiết kế ĐÚNG sẵn

| Thiết kế hiện có | Khớp với câu trả lời nào |
|---|---|
| `Lot` có `color`, `size` | Câu 5 — "có cần theo dõi màu sắc/size" |
| `Lot` có `manufactureDate`, `expiryDate` | Câu 4 — theo dõi lô/batch/ngày SX/HSD |
| `Item.minStock` / `maxStock` chỉnh được | Câu 6 — mức tồn khác nhau theo loại, kho tự chỉnh |
| Enum `qc_status` (PENDING/FAILED/PARTIALLY_PASSED/PENDING_DISPOSITION...) | Câu 12 — gần khớp với "Rejected / Pending / Marginal Accepted" mà Sếp đưa ra |
| `Warehouse` → `Zone` → `Rack` → `StorageLocation` (đa cấp, đa kho) | Câu 17 — xác nhận có 4 kho vật lý riêng biệt |

→ Không phải làm lại từ đầu, nền tảng Module 1 vẫn dùng được.

---

## 2. Thay đổi lớn về SCOPE — cần biết trước khi code tiếp

### 2.1. Đây không phải 1 app cho 1 kho — mà là 3 app nghiệp vụ riêng + luồng duyệt chéo phòng ban

- **Kho RM (nguyên phụ liệu)** — nhập/xuất NPL, có QR/Barcode theo lô, in phiếu nhập/xuất.
- **Color Kitchen (phòng pha màu)** — tạo mã sản phẩm riêng, in tem dán sản phẩm khi xuất cho sản xuất.
- **Kho thành phẩm** — nhập/xuất/tồn.
- **Các phòng ban khác** (PMC/CS/FD...) — **chỉ được tạo phiếu yêu cầu xuất kho**, không được sửa dữ liệu kho.

→ Đây là lý do Auth/RBAC (đang bị deferred) **không thể để sau cùng** — phân quyền theo phòng ban là xương sống của toàn hệ thống, không phải tính năng phụ.

### 2.2. Luồng duyệt xuất kho có nhiều cấp (workflow, không phải CRUD đơn giản)

```
User phòng ban tạo đề nghị xuất
        ↓
Head bộ phận duyệt
        ↓
BOD duyệt cuối cùng
        ↓
Thủ kho thực xuất
```

→ Module Xuất kho cần state machine (Draft → Submitted → HeadApproved → BODApproved → Issued/Rejected), không đơn thuần là bảng ghi giao dịch.

### 2.3. GoodsReturn (Module 5) bị thu hẹp phạm vi

Câu trả lời 16: **Kho nguyên liệu KHÔNG nhận hàng trả** sau sản xuất. Chỉ **Color Kitchen** có luồng trả (màu dư trả về phòng pha màu).

→ Nếu Module 5 đang code cho "trả hàng chung", cần sửa lại: chỉ áp dụng cho Color Kitchen, không áp dụng cho RM/Vật tư.

### 2.4. QC bắt buộc 100%, không có ngoại lệ

Câu 10: **tất cả** mã trong kho nguyên liệu đều phải QC — khác với giả định ban đầu "một số vật tư có thể miễn QC".

→ Bỏ ý tưởng field `requiresQc` linh hoạt — với kho RM, mặc định luôn `true`.

### 2.5. Phiếu kiểm hàng cần upload HÌNH ẢNH

Câu 10: "tạo chức năng phiếu kiểm hàng để **chụp hình và up vào hệ thống**".

→ Đây là tính năng **hoàn toàn mới**, chưa có trong spec bất kỳ module nào: cần file/image upload + storage (S3/Supabase Storage), không chỉ là text field.

### 2.6. Khu cách ly hàng lỗi là VỊ TRÍ VẬT LÝ riêng

Câu 20: có khu vực cách ly thật trong kho, không chỉ là 1 trạng thái trên hệ thống.

→ Cần thêm field đánh dấu cho `Zone` hoặc `StorageLocation` (ví dụ `zoneType: NORMAL | QUARANTINE`), hiện schema Module 1 **chưa có field này**.

### 2.7. Nhập kho cần liên kết PO/Packing List/Invoice

Câu 8: "nhập theo PO / số packing list / Invoice để theo dõi cho từng lô hàng".

→ `Lot` hoặc phiếu nhập kho (Module 2) cần thêm field tham chiếu PO/Packing List/Invoice — **chưa có trong schema Module 1 hiện tại**.

### 2.8. Cảnh báo tồn kho phải chủ động (không chỉ hiển thị số)

Câu 2: "cần chức năng **tự thông báo** khi đến điểm tồn kho".

→ Không chỉ so sánh `currentStock < minStock` khi load trang — cần cơ chế thông báo chủ động (email, notification trong app, hoặc badge cảnh báo). Cần quyết định kênh thông báo cụ thể.

### 2.9. Xuất báo cáo Excel là bắt buộc

Câu 3: không cần tích hợp MISA, nhưng **phải xuất được báo cáo ra file Excel**.

→ Cần tính năng export cho các bảng tồn kho/lịch sử giao dịch — nên đưa vào scope chung, áp dụng cho nhiều module chứ không riêng 1 module.

### 2.10. Kiểm kê: dung sai bằng 0 (trừ Color Kitchen)

Câu 19: "không được phép chênh lệch ngoại trừ phòng pha màu".

→ Đơn giản hóa: chỉ cần 1 ngưỡng dung sai áp dụng riêng cho Color Kitchen, còn lại 3 kho là zero-tolerance (chênh lệch = phải giải trình ngay, không có "ngưỡng %").

---

## 3. Câu hỏi CẦN HỎI LẠI SẾP trước khi code (còn mơ hồ hoặc chưa hỏi)

1. **Mức dung sai % cụ thể cho Color Kitchen** khi kiểm kê — câu trả lời chỉ nói "ngoại trừ phòng pha màu", chưa có con số.
2. **Hệ thống TOGO (Work Order/BOM) có cần tích hợp API không**, hay chỉ cần nhập tay số Work Order để tham chiếu? (Câu 13 chỉ xác nhận TOGO đã tồn tại, chưa nói cách phối hợp).
3. **"Đang đau nhất ở đâu" (câu 23)** — câu trả lời "đang làm thủ công" chưa chỉ rõ module/phòng ban nào cần ưu tiên số 1. Cần hỏi lại cụ thể: RM warehouse, Color Kitchen, hay khâu duyệt xuất kho?
4. **Barcode/QR: máy in tem cụ thể là model nào** — để chọn đúng thư viện in tem (khổ giấy, chuẩn mã vạch) khớp với máy in tem có keo dán mà Sếp mô tả.
5. **Kênh thông báo cảnh báo tồn kho**: email, SMS, hay chỉ hiển thị trong app?

---

## 4. Thực tế về deadline — Tháng 10/2026 là RẤT GẤP

Hôm nay 29/08/2026 → còn khoảng **6 tuần** tới deadline demo. Với scope đã mở rộng (3 app nghiệp vụ + workflow duyệt đa cấp + upload ảnh + in tem + export Excel), **8 module làm song song full-scope là không khả thi trong 6 tuần** nếu chỉ có 1 người điều phối.

### Đề xuất thu hẹp MVP cho demo tháng 10:

**Ưu tiên cao (phải có cho demo):**
- Module 1 (Danh mục) — đã xong
- Module 2 (Nhập kho RM) — có PO reference, QR/lot code
- Module 3 (QC) — với upload ảnh, 3 trạng thái Rejected/Pending/Marginal Accepted
- Auth cơ bản (login + phân quyền theo phòng ban) — **đẩy lên làm sớm, không để cuối**

**Ưu tiên trung bình (có thể demo ở mức đơn giản hóa):**
- Module xuất kho — luồng duyệt 2 cấp (Head → BOD) nhưng UI có thể đơn giản trước
- Export Excel cơ bản

**Có thể lùi sau demo tháng 10:**
- Color Kitchen (app riêng, phức tạp — tem sản phẩm riêng)
- Kiểm kê định kỳ
- Điều chuyển kho
- Tích hợp TOGO (nếu cần)

→ Nên trao đổi lại với Sếp: demo tháng 10 sẽ show đủ **luồng RM warehouse hoàn chỉnh** (nhập → QC → tồn kho → xuất kho có duyệt), còn Color Kitchen/Kiểm kê/Điều chuyển sẽ demo giai đoạn sau — tránh cam kết quá tay rồi không kịp.

---

## 5. Việc cần làm ngay khi quay lại code

1. Cập nhật Prisma schema Module 1: thêm `zoneType` (quarantine), thêm PO/Packing List reference cho Lot hoặc phiếu nhập.
2. Thiết kế lại Module Auth sớm hơn kế hoạch — vì phân quyền theo phòng ban là core, không phải phụ.
3. Thiết kế state machine cho luồng duyệt xuất kho (Module 6 hoặc module riêng).
4. Nghiên cứu thư viện upload ảnh (multer + storage) cho phiếu QC.
5. Gửi lại 5 câu hỏi ở mục 3 cho Sếp trước khi khóa spec Module 2/3/6.
