requireAuth();

let warehousesCache = [];
let failedLotsCache = [];
let itemsCache = [];
let currentDetailId = null;

(async function init() {
  await loadI18n();
  renderTopbar("disposal");
  applyTranslations();
  await loadDropdownData();
  await loadList();
})();

async function loadDropdownData() {
  const [whRes, lotsRes, itemsRes] = await Promise.all([
    apiFetch("/warehouses?limit=100"),
    apiFetch("/lots?qcStatus=FAILED&limit=100"),
    apiFetch("/items?limit=500"),
  ]);

  const SYSTEM_WAREHOUSE_CODES = ["IN_TRANSIT", "SYSTEM_TEST"];
  warehousesCache = (whRes.ok ? whRes.data.data : []).filter((w) => !SYSTEM_WAREHOUSE_CODES.includes(w.code));
  failedLotsCache = lotsRes.ok ? lotsRes.data.data : [];
  itemsCache = itemsRes.ok ? itemsRes.data.data : [];

  const whSelect = document.getElementById("f_warehouseId");
  whSelect.innerHTML = warehousesCache.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");

  const lotSelect = document.getElementById("f_lotId");
  lotSelect.innerHTML = failedLotsCache
    .map((l) => `<option value="${l.id}">${l.lotCode} — ${itemName(l.itemId)}</option>`)
    .join("");
}

function itemName(itemId) {
  const item = itemsCache.find((i) => i.id === itemId);
  return item ? `${item.name} (${item.code})` : "#" + itemId;
}

function warehouseName(id) {
  const w = warehousesCache.find((x) => x.id === id);
  return w ? w.name : "#" + id;
}

// Khi doi lo/kho, tra cuu ton kha dung de nguoi dung biet gioi han truoc
// khi nhap so luong (goi lai chinh API bao cao da co, khong can API rieng).
async function onLotChange() {
  await refreshAvailable();
}

document.addEventListener("DOMContentLoaded", () => {
  const whSelectCheck = document.getElementById("f_warehouseId");
  if (whSelectCheck) whSelectCheck.addEventListener("change", refreshAvailable);
});

async function refreshAvailable() {
  const lotId = document.getElementById("f_lotId").value;
  const warehouseId = document.getElementById("f_warehouseId").value;
  const availableInput = document.getElementById("f_available");
  if (!lotId || !warehouseId) {
    availableInput.value = "";
    return;
  }
  const res = await apiFetch(`/stock-ledger/balance-by-lot?lotId=${lotId}&warehouseId=${warehouseId}`);
  if (res.ok && res.data.length > 0) {
    availableInput.value = formatNumber(res.data[0].balance);
  } else {
    availableInput.value = "0";
  }
}

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/disposal-requests?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const requests = res.data.data;
  if (requests.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("disposal.emptyState")}</div>`;
    return;
  }

  const rows = requests
    .map(
      (r) => `
        <tr class="clickable" onclick="openDetail(${r.id})">
          <td><strong>${r.code}</strong></td>
          <td>${r.lot.lotCode} — ${r.lot.item ? r.lot.item.name : ""}</td>
          <td>${r.warehouse ? r.warehouse.name : "#" + r.warehouseId}</td>
          <td>${formatNumber(r.quantity)}</td>
          <td>${statusBadge(r.status)}</td>
        </tr>`,
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("disposal.tableCode")}</th>
        <th>${t("disposal.lotLabel")}</th>
        <th>${t("common.warehouse")}</th>
        <th>${t("disposal.quantityLabel")}</th>
        <th>${t("common.status")}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// -------------------------------------------------------------------------
// TAO MOI
// -------------------------------------------------------------------------
function toggleCreateForm() {
  const card = document.getElementById("createCard");
  const isHidden = card.style.display === "none";
  card.style.display = isHidden ? "block" : "none";
  document.getElementById("detailCard").style.display = "none";
  hideError("createError");
  if (isHidden) refreshAvailable();
}

async function submitCreateForm() {
  hideError("createError");
  const body = {
    lotId: Number(document.getElementById("f_lotId").value),
    warehouseId: Number(document.getElementById("f_warehouseId").value),
    quantity: Number(document.getElementById("f_quantity").value),
    reason: document.getElementById("f_reason").value.trim(),
  };

  if (!body.lotId || !body.warehouseId || !body.quantity || !body.reason) {
    showError("createError", t("disposal.fillAllFields"));
    return;
  }

  const btn = document.querySelector('#createCard button[onclick="submitCreateForm()"]');
  btn.disabled = true;

  const res = await apiFetch("/disposal-requests", { method: "POST", body: JSON.stringify(body) });

  btn.disabled = false;

  if (!res.ok) {
    showError("createError", extractErrorMessage(res.data));
    return;
  }

  toggleCreateForm();
  document.getElementById("f_reason").value = "";
  document.getElementById("f_quantity").value = "";
  await loadDropdownData(); // lo vua tao phieu se chuyen PENDING_DISPOSITION, khong con trong danh sach FAILED nua
  await loadList();
  openDetail(res.data.id);
}

// -------------------------------------------------------------------------
// CHI TIET
// -------------------------------------------------------------------------
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
  const res = await apiFetch(`/disposal-requests/${currentDetailId}`);
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  const r = res.data;
  document.getElementById("detailCode").innerHTML = `${r.code} — ${statusBadge(r.status)}`;

  const user = getCurrentUser();
  let actionsHtml = "";
  if (r.status === "DRAFT") {
    actionsHtml = `
      <button class="btn btn-primary" onclick="doSubmit()">${t("disposal.submitBtn")}</button>
      <button class="btn btn-danger" onclick="doDelete()">${t("common.delete")}</button>`;
  } else if (r.status === "PENDING_QA_APPROVAL" && user && (user.role === "QC_MANAGER" || user.role === "ADMIN")) {
    actionsHtml = `
      <button class="btn btn-success" onclick="doApproveQa()">${t("disposal.approveQaBtn")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("common.reject")}</button>`;
  } else if (r.status === "PENDING_BOD_APPROVAL" && user && (user.role === "BOD" || user.role === "ADMIN")) {
    actionsHtml = `
      <button class="btn btn-success" onclick="doApproveBod()">${t("disposal.approveBodBtn")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("common.reject")}</button>`;
  }

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="label">${t("disposal.lotLabel")}</div><div class="value">${r.lot.lotCode}</div></div>
      <div class="detail-field"><div class="label">${t("disposal.itemLabel")}</div><div class="value">${r.lot.item ? r.lot.item.name : "—"}</div></div>
      <div class="detail-field"><div class="label">${t("common.warehouse")}</div><div class="value">${r.warehouse ? r.warehouse.name : "—"}</div></div>
      <div class="detail-field"><div class="label">${t("disposal.quantityLabel")}</div><div class="value">${formatNumber(r.quantity)}</div></div>
    </div>
    <div class="detail-field" style="margin-bottom:16px;">
      <div class="label">${t("disposal.reasonLabel")}</div>
      <div class="value" style="font-weight:400;">${r.reason}</div>
    </div>
    ${r.rejectionReason ? `<div class="error-box show">${t("disposal.rejectionReasonLabel")}: ${r.rejectionReason}</div>` : ""}
    <div class="btn-row">${actionsHtml}</div>
  `;
}

async function doSubmit() {
  hideError("detailError");
  const res = await apiFetch(`/disposal-requests/${currentDetailId}/submit`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doApproveQa() {
  hideError("detailError");
  const res = await apiFetch(`/disposal-requests/${currentDetailId}/approve-qa`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doApproveBod() {
  hideError("detailError");
  const res = await apiFetch(`/disposal-requests/${currentDetailId}/approve-bod`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  showSuccess("detailSuccess", t("disposal.approvedSuccess"));
  await renderDetail();
  await loadList();
}

async function doReject() {
  const reason = prompt(t("disposal.rejectReasonPrompt"));
  if (!reason) return;
  hideError("detailError");
  const res = await apiFetch(`/disposal-requests/${currentDetailId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
  await loadDropdownData(); // lo tro lai FAILED, xuat hien lai trong dropdown
}

async function doDelete() {
  if (!confirm(t("disposal.deleteConfirm"))) return;
  hideError("detailError");
  const res = await apiFetch(`/disposal-requests/${currentDetailId}`, { method: "DELETE" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  closeDetail();
  await loadList();
  await loadDropdownData();
}
