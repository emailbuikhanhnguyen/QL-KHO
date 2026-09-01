requireAuth();
renderTopbar("goods-receipts");

let itemsCache = [];
let warehousesCache = [];
let suppliersCache = [];
let lineCounter = 0;

// -------------------------------------------------------------------------
// Khoi tao trang
// -------------------------------------------------------------------------
(async function init() {
  await loadDropdownData();
  await loadList();
})();

async function loadDropdownData() {
  const [wh, sup, it] = await Promise.all([
    apiFetch("/warehouses?limit=100"),
    apiFetch("/suppliers?limit=100"),
    apiFetch("/items?limit=100"),
  ]);
  warehousesCache = wh.ok ? wh.data.data : [];
  suppliersCache = sup.ok ? sup.data.data : [];
  itemsCache = it.ok ? it.data.data : [];

  const whSelect = document.getElementById("f_warehouseId");
  whSelect.innerHTML = warehousesCache.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");

  const supSelect = document.getElementById("f_supplierId");
  supSelect.innerHTML = suppliersCache.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");

  if (itemsCache.length === 0) {
    showError("createError", "Chưa có Vật tư nào trong hệ thống. Vào Swagger (/api/docs) tạo Item trước.");
  }
}

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/goods-receipts?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const receipts = res.data.data;
  if (receipts.length === 0) {
    container.innerHTML = `<div class="empty-state">Chưa có phiếu nhập nào. Bấm "Tạo phiếu mới" để bắt đầu.</div>`;
    return;
  }

  const rows = receipts
    .map((r) => {
      const warehouse = warehousesCache.find((w) => w.id === r.warehouseId);
      return `
        <tr class="clickable" onclick="openDetail(${r.id})">
          <td><strong>${r.code}</strong></td>
          <td>${warehouse ? warehouse.name : "#" + r.warehouseId}</td>
          <td>${r.lines.length} dòng</td>
          <td>${statusBadge(r.status)}</td>
          <td>${formatDateTime(r.createdAt)}</td>
        </tr>`;
    })
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr><th>Mã phiếu</th><th>Kho</th><th>Số dòng</th><th>Trạng thái</th><th>Ngày tạo</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// -------------------------------------------------------------------------
// FORM TAO MOI
// -------------------------------------------------------------------------
function toggleCreateForm() {
  const card = document.getElementById("createCard");
  const isHidden = card.style.display === "none";
  card.style.display = isHidden ? "block" : "none";
  document.getElementById("detailCard").style.display = "none";
  hideError("createError");
  if (isHidden && document.getElementById("linesContainer").children.length === 0) {
    addLine();
  }
}

function addLine() {
  lineCounter++;
  const id = lineCounter;
  const itemOptions = itemsCache.map((i) => `<option value="${i.id}">${i.name} (${i.code})</option>`).join("");

  const div = document.createElement("div");
  div.className = "line-item";
  div.id = `line_${id}`;
  div.innerHTML = `
    <button class="remove-line" onclick="removeLine(${id})">✕ Xóa dòng</button>
    <div class="form-grid">
      <div class="form-row">
        <label>Vật tư *</label>
        <select id="line_${id}_itemId">${itemOptions}</select>
      </div>
      <div class="form-row">
        <label>Mã lô *</label>
        <input type="text" id="line_${id}_lotCode" placeholder="LOT-2026-001" />
      </div>
    </div>
    <div class="form-grid cols-3">
      <div class="form-row">
        <label>Màu sắc</label>
        <input type="text" id="line_${id}_color" />
      </div>
      <div class="form-row">
        <label>Khổ / Size</label>
        <input type="text" id="line_${id}_size" />
      </div>
      <div class="form-row">
        <label>Số lượng *</label>
        <input type="number" id="line_${id}_quantity" min="0.001" step="0.001" />
      </div>
    </div>
    <div class="form-grid">
      <div class="form-row">
        <label>Ngày sản xuất</label>
        <input type="date" id="line_${id}_manufactureDate" />
      </div>
      <div class="form-row">
        <label>Hạn sử dụng</label>
        <input type="date" id="line_${id}_expiryDate" />
      </div>
    </div>
  `;
  document.getElementById("linesContainer").appendChild(div);
}

function removeLine(id) {
  const el = document.getElementById(`line_${id}`);
  if (el) el.remove();
}

function collectLines() {
  const lineEls = document.querySelectorAll("#linesContainer .line-item");
  const lines = [];
  for (const el of lineEls) {
    const id = el.id.replace("line_", "");
    const itemId = Number(document.getElementById(`line_${id}_itemId`).value);
    const lotCode = document.getElementById(`line_${id}_lotCode`).value.trim();
    const quantity = Number(document.getElementById(`line_${id}_quantity`).value);
    const color = document.getElementById(`line_${id}_color`).value.trim();
    const size = document.getElementById(`line_${id}_size`).value.trim();
    const manufactureDate = document.getElementById(`line_${id}_manufactureDate`).value;
    const expiryDate = document.getElementById(`line_${id}_expiryDate`).value;

    if (!lotCode || !quantity) continue;

    const line = { itemId, lotCode, quantity };
    if (color) line.color = color;
    if (size) line.size = size;
    if (manufactureDate) line.manufactureDate = manufactureDate;
    if (expiryDate) line.expiryDate = expiryDate;
    lines.push(line);
  }
  return lines;
}

async function submitCreateForm() {
  hideError("createError");
  const lines = collectLines();
  if (lines.length === 0) {
    showError("createError", "Cần ít nhất 1 dòng hàng hợp lệ (đủ mã lô + số lượng).");
    return;
  }

  const body = {
    warehouseId: Number(document.getElementById("f_warehouseId").value),
    supplierId: Number(document.getElementById("f_supplierId").value),
    poNumber: document.getElementById("f_poNumber").value.trim() || undefined,
    packingListNumber: document.getElementById("f_packingListNumber").value.trim() || undefined,
    invoiceNumber: document.getElementById("f_invoiceNumber").value.trim() || undefined,
    note: document.getElementById("f_note").value.trim() || undefined,
    lines,
  };

  const btn = document.getElementById("createSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Đang tạo...";

  const res = await apiFetch("/goods-receipts", { method: "POST", body: JSON.stringify(body) });

  btn.disabled = false;
  btn.textContent = "Tạo phiếu (DRAFT)";

  if (!res.ok) {
    showError("createError", extractErrorMessage(res.data));
    return;
  }

  toggleCreateForm();
  document.getElementById("linesContainer").innerHTML = "";
  await loadList();
  openDetail(res.data.id);
}

// -------------------------------------------------------------------------
// CHI TIET + HANH DONG THEO TRANG THAI
// -------------------------------------------------------------------------
let currentDetailId = null;

async function openDetail(id) {
  currentDetailId = id;
  document.getElementById("createCard").style.display = "none";
  document.getElementById("detailCard").style.display = "block";
  hideError("detailError");
  await renderDetail();
  document.getElementById("detailCard").scrollIntoView({ behavior: "smooth" });
}

function closeDetail() {
  document.getElementById("detailCard").style.display = "none";
  currentDetailId = null;
}

async function renderDetail() {
  const res = await apiFetch(`/goods-receipts/${currentDetailId}`);
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  const r = res.data;
  document.getElementById("detailCode").textContent = `${r.code} — ${statusBadge(r.status)}`;

  const warehouse = warehousesCache.find((w) => w.id === r.warehouseId);
  const supplier = suppliersCache.find((s) => s.id === r.supplierId);

  const linesHtml = r.lines
    .map(
      (l) => `
      <tr>
        <td>${l.item ? l.item.name : "#" + l.itemId}</td>
        <td>${l.lotCode}</td>
        <td>${l.color || "—"}</td>
        <td>${formatNumber(l.quantity)}</td>
        <td>${l.lotId ? "✅ Đã tạo (#" + l.lotId + ")" : "Chưa tạo"}</td>
        <td>${l.lotId ? `<button class="btn btn-outline btn-sm" onclick="viewQrCode(${l.lotId})">📷 Xem QR</button>` : "—"}</td>
      </tr>`
    )
    .join("");

  let actionsHtml = "";
  if (r.status === "DRAFT") {
    actionsHtml = `
      <button class="btn btn-primary" onclick="doAction('submit')">Gửi duyệt</button>
      <button class="btn btn-danger" onclick="doDelete()">Xóa phiếu</button>`;
  } else if (r.status === "PENDING_APPROVAL") {
    actionsHtml = `
      <button class="btn btn-success" onclick="doAction('approve')">✔ Duyệt</button>
      <button class="btn btn-danger" onclick="doReject()">✕ Từ chối</button>`;
  } else if (r.status === "REJECTED") {
    actionsHtml = `<button class="btn btn-secondary" onclick="doAction('reopen')">Mở lại để sửa</button>`;
  }

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="label">Kho</div><div class="value">${warehouse ? warehouse.name : "—"}</div></div>
      <div class="detail-field"><div class="label">Nhà cung cấp</div><div class="value">${supplier ? supplier.name : "—"}</div></div>
      <div class="detail-field"><div class="label">Số PO</div><div class="value">${r.poNumber || "—"}</div></div>
      <div class="detail-field"><div class="label">Packing List</div><div class="value">${r.packingListNumber || "—"}</div></div>
      <div class="detail-field"><div class="label">Invoice</div><div class="value">${r.invoiceNumber || "—"}</div></div>
      <div class="detail-field"><div class="label">Ngày tạo</div><div class="value">${formatDateTime(r.createdAt)}</div></div>
    </div>
    ${r.rejectedReason ? `<div class="error-box show">Lý do từ chối: ${r.rejectedReason}</div>` : ""}
    <h3>Dòng hàng</h3>
    <table>
      <thead><tr><th>Vật tư</th><th>Mã lô</th><th>Màu</th><th>Số lượng</th><th>Lot</th><th>Tem QR</th></tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <div class="btn-row">${actionsHtml}</div>
  `;
}

async function doAction(action) {
  hideError("detailError");
  const res = await apiFetch(`/goods-receipts/${currentDetailId}/${action}`, { method: "POST" });
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  showSuccess("detailSuccess", "Thao tác thành công.");
  await renderDetail();
  await loadList();
}

async function doReject() {
  const reason = prompt("Nhập lý do từ chối:");
  if (!reason) return;
  hideError("detailError");
  const res = await apiFetch(`/goods-receipts/${currentDetailId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  await renderDetail();
  await loadList();
}

async function doDelete() {
  if (!confirm("Xóa phiếu này? Không thể hoàn tác.")) return;
  const res = await apiFetch(`/goods-receipts/${currentDetailId}`, { method: "DELETE" });
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  closeDetail();
  await loadList();
}

// -------------------------------------------------------------------------
// Xem/in tem QR cho 1 Lot — mo trong tab moi de in (Ctrl+P), dung de dan
// len hang vat ly. Dung fetch+blob vi endpoint yeu cau dang nhap, the
// <img src> thuong khong tu gui kem token duoc.
// -------------------------------------------------------------------------
async function viewQrCode(lotId) {
  const url = await apiFetchImageUrl(`/lots/${lotId}/qrcode`);
  if (!url) {
    alert("Không tải được mã QR. Vui lòng thử lại.");
    return;
  }
  window.open(url, "_blank");
}
