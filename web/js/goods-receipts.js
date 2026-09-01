requireAuth();

let itemsCache = [];
let warehousesCache = [];
let suppliersCache = [];
let lineCounter = 0;

// -------------------------------------------------------------------------
// Khoi tao trang — PHAI cho i18n tai xong truoc khi ve topbar/dich noi dung
// -------------------------------------------------------------------------
(async function init() {
  await loadI18n();
  renderTopbar("goods-receipts");
  applyTranslations();
  await loadDropdownData();
  await loadList();
})();

async function loadDropdownData() {
  const [wh, sup, it] = await Promise.all([
    apiFetch("/warehouses?limit=100"),
    apiFetch("/suppliers?limit=100"),
    apiFetch("/items?limit=100"),
  ]);
  // Loai bo cac kho "he thong" (IN_TRANSIT, SYSTEM_TEST) khoi dropdown —
  // nguoi dung that khong bao gio nen chon nham cac kho nay.
  const SYSTEM_WAREHOUSE_CODES = ["IN_TRANSIT", "SYSTEM_TEST"];
  warehousesCache = (wh.ok ? wh.data.data : []).filter(
    (w) => !SYSTEM_WAREHOUSE_CODES.includes(w.code)
  );
  suppliersCache = sup.ok ? sup.data.data : [];
  itemsCache = it.ok ? it.data.data : [];

  const whSelect = document.getElementById("f_warehouseId");
  whSelect.innerHTML = warehousesCache.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");

  const supSelect = document.getElementById("f_supplierId");
  supSelect.innerHTML = suppliersCache.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");

  if (itemsCache.length === 0) {
    showError("createError", t("goodsReceipt.noItemsWarning"));
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
    container.innerHTML = `<div class="empty-state">${t("goodsReceipt.emptyState")}</div>`;
    return;
  }

  const rows = receipts
    .map((r) => {
      const warehouse = warehousesCache.find((w) => w.id === r.warehouseId);
      return `
        <tr class="clickable" onclick="openDetail(${r.id})">
          <td><strong>${r.code}</strong></td>
          <td>${warehouse ? warehouse.name : "#" + r.warehouseId}</td>
          <td>${r.lines.length} ${t("goodsReceipt.lineCount")}</td>
          <td>${statusBadge(r.status)}</td>
          <td>${formatDateTime(r.createdAt)}</td>
        </tr>`;
    })
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("goodsReceipt.tableCode")}</th>
        <th>${t("goodsReceipt.tableWarehouse")}</th>
        <th>${t("goodsReceipt.tableLines")}</th>
        <th>${t("goodsReceipt.tableStatus")}</th>
        <th>${t("goodsReceipt.tableDate")}</th>
      </tr></thead>
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
    <button class="remove-line" onclick="removeLine(${id})">${t("goodsReceipt.removeLine")}</button>
    <div class="form-grid">
      <div class="form-row">
        <label>${t("goodsReceipt.itemLabel")}</label>
        <select id="line_${id}_itemId">${itemOptions}</select>
      </div>
      <div class="form-row">
        <label>${t("goodsReceipt.lotCodeLabel")}</label>
        <input type="text" id="line_${id}_lotCode" placeholder="${t("goodsReceipt.lotCodePlaceholder")}" />
      </div>
    </div>
    <div class="form-grid cols-3">
      <div class="form-row">
        <label>${t("goodsReceipt.colorLabel")}</label>
        <input type="text" id="line_${id}_color" />
      </div>
      <div class="form-row">
        <label>${t("goodsReceipt.sizeLabel")}</label>
        <input type="text" id="line_${id}_size" />
      </div>
      <div class="form-row">
        <label>${t("goodsReceipt.quantityLabel")}</label>
        <input type="number" id="line_${id}_quantity" min="0.001" step="0.001" />
      </div>
    </div>
    <div class="form-grid">
      <div class="form-row">
        <label>${t("goodsReceipt.mfgDateLabel")}</label>
        <input type="date" id="line_${id}_manufactureDate" />
      </div>
      <div class="form-row">
        <label>${t("goodsReceipt.expDateLabel")}</label>
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
    showError("createError", t("goodsReceipt.needAtLeastOneLine"));
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
  btn.textContent = t("common.loading");

  const res = await apiFetch("/goods-receipts", { method: "POST", body: JSON.stringify(body) });

  btn.disabled = false;
  btn.textContent = t("goodsReceipt.submitCreateBtn");

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
  document.getElementById("detailCode").innerHTML = `${r.code} — ${statusBadge(r.status)}`;

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
        <td>${l.lotId ? "✅ " + t("goodsReceipt.created") + " (#" + l.lotId + ")" : t("goodsReceipt.notCreated")}</td>
        <td>${l.lotId ? `<button class="btn btn-outline btn-sm" onclick="viewQrCode(${l.lotId})">${t("goodsReceipt.viewQr")}</button>` : "—"}</td>
      </tr>`
    )
    .join("");

  let actionsHtml = "";
  if (r.status === "DRAFT") {
    actionsHtml = `
      <button class="btn btn-primary" onclick="doAction('submit')">${t("goodsReceipt.submitForApproval")}</button>
      <button class="btn btn-danger" onclick="doDelete()">${t("goodsReceipt.deleteReceipt")}</button>`;
  } else if (r.status === "PENDING_APPROVAL") {
    actionsHtml = `
      <button class="btn btn-success" onclick="doAction('approve')">${t("goodsReceipt.approve")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("goodsReceipt.reject")}</button>`;
  } else if (r.status === "REJECTED") {
    actionsHtml = `<button class="btn btn-secondary" onclick="doAction('reopen')">${t("goodsReceipt.reopen")}</button>`;
  }

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="label">${t("goodsReceipt.detailWarehouse")}</div><div class="value">${warehouse ? warehouse.name : "—"}</div></div>
      <div class="detail-field"><div class="label">${t("goodsReceipt.detailSupplier")}</div><div class="value">${supplier ? supplier.name : "—"}</div></div>
      <div class="detail-field"><div class="label">${t("goodsReceipt.detailPO")}</div><div class="value">${r.poNumber || "—"}</div></div>
      <div class="detail-field"><div class="label">${t("goodsReceipt.detailPL")}</div><div class="value">${r.packingListNumber || "—"}</div></div>
      <div class="detail-field"><div class="label">${t("goodsReceipt.detailInvoice")}</div><div class="value">${r.invoiceNumber || "—"}</div></div>
      <div class="detail-field"><div class="label">${t("goodsReceipt.detailDate")}</div><div class="value">${formatDateTime(r.createdAt)}</div></div>
    </div>
    ${r.rejectedReason ? `<div class="error-box show">${t("goodsReceipt.rejectedReasonLabel")}: ${r.rejectedReason}</div>` : ""}
    <h3>${t("goodsReceipt.linesTitle")}</h3>
    <table>
      <thead><tr>
        <th>${t("goodsReceipt.linesHeaderItem")}</th>
        <th>${t("goodsReceipt.linesHeaderLotCode")}</th>
        <th>${t("goodsReceipt.linesHeaderColor")}</th>
        <th>${t("goodsReceipt.linesHeaderQty")}</th>
        <th>${t("goodsReceipt.linesHeaderLot")}</th>
        <th>${t("goodsReceipt.linesHeaderQr")}</th>
      </tr></thead>
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
  showSuccess("detailSuccess", t("goodsReceipt.actionSuccess"));
  await renderDetail();
  await loadList();
}

async function doReject() {
  const reason = prompt(t("goodsReceipt.rejectReasonPrompt"));
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
  if (!confirm(t("goodsReceipt.deleteConfirm"))) return;
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
