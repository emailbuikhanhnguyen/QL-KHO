requireAuth();

const BOD_EMAIL_THRESHOLD_USD = 2000;
let currentDetailId = null;
let approvedRequisitionsCache = [];

(async function init() {
  await loadI18n();
  renderTopbar("pricedpr");
  applyTranslations();
  await loadApprovedRequisitions();

  // Neu vao tu nut "Tao PR co gia" o trang Yeu cau mua hang (kem query
  // param), tu mo san form tao moi va chon dung Requisition đó.
  const params = new URLSearchParams(window.location.search);
  const fromId = params.get("fromRequisitionId");
  if (fromId) {
    toggleCreateForm();
    document.getElementById("f_requisitionId").value = fromId;
    await onRequisitionChange();
  }

  await loadList();
})();

async function loadApprovedRequisitions() {
  const res = await apiFetch("/purchase-requisitions?status=APPROVED&limit=100");
  approvedRequisitionsCache = res.ok ? res.data.data : [];
  const select = document.getElementById("f_requisitionId");
  select.innerHTML =
    `<option value="">${t("pricedpr.selectPlaceholder")}</option>` +
    approvedRequisitionsCache.map((r) => `<option value="${r.id}">${r.code} — ${r.reason}</option>`).join("");
}

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/purchase-requests?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const requests = res.data.data;
  if (requests.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("pricedpr.emptyState")}</div>`;
    return;
  }

  const rows = requests
    .map(
      (r) => `
        <tr class="clickable" onclick="openDetail(${r.id})">
          <td><strong>${r.code}</strong></td>
          <td>${r.purchaseRequisition.code}</td>
          <td>${formatNumber(r.totalAmountUsd)} USD</td>
          <td>${statusBadge(r.status)}</td>
        </tr>`,
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("pricedpr.tableCode")}</th>
        <th>${t("pricedpr.requisitionCodeLabel")}</th>
        <th>${t("pricedpr.totalLabel")}</th>
        <th>${t("common.status")}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// -------------------------------------------------------------------------
// TAO MOI — chon Requisition -> tu dong hien cac dong de dien don gia
// -------------------------------------------------------------------------
function toggleCreateForm() {
  const card = document.getElementById("createCard");
  const isHidden = card.style.display === "none";
  card.style.display = isHidden ? "block" : "none";
  document.getElementById("detailCard").style.display = "none";
  hideError("createError");
}

async function onRequisitionChange() {
  const id = document.getElementById("f_requisitionId").value;
  const container = document.getElementById("linesEditContainer");
  const totalBanner = document.getElementById("totalBanner");
  if (!id) {
    container.innerHTML = "";
    totalBanner.style.display = "none";
    return;
  }

  const res = await apiFetch(`/purchase-requisitions/${id}`);
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const requisition = res.data;

  const rows = requisition.lines
    .map(
      (l, idx) => `
      <div class="pr-line-row" data-item-name="${l.itemName}" data-quantity="${l.quantity}" data-unit="${l.unit}">
        <div class="readonly-cell">${l.itemName}</div>
        <div class="readonly-cell">${formatNumber(l.quantity)}</div>
        <div class="readonly-cell">${l.unit}</div>
        <input type="number" step="0.01" min="0" placeholder="${t("pricedpr.unitPricePlaceholder")}" class="pr-line-price" oninput="recalcTotal()" />
        <div class="readonly-cell pr-line-total" id="lineTotal-${idx}">0 USD</div>
      </div>`,
    )
    .join("");

  container.innerHTML = `
    <div class="pr-line-row" style="font-weight:600;">
      <div>${t("requisition.itemNamePlaceholder")}</div>
      <div>${t("requisition.quantityPlaceholder")}</div>
      <div>${t("requisition.unitPlaceholder")}</div>
      <div>${t("pricedpr.unitPricePlaceholder")}</div>
      <div>${t("pricedpr.lineTotalLabel")}</div>
    </div>
    ${rows}`;

  recalcTotal();
}

function recalcTotal() {
  let total = 0;
  document.querySelectorAll(".pr-line-row[data-item-name]").forEach((row, idx) => {
    const priceInput = row.querySelector(".pr-line-price");
    const price = Number(priceInput.value) || 0;
    const qty = Number(row.dataset.quantity);
    const lineTotal = price * qty;
    total += lineTotal;
    const totalCell = document.getElementById(`lineTotal-${idx}`);
    if (totalCell) totalCell.textContent = formatNumber(lineTotal) + " USD";
  });

  const banner = document.getElementById("totalBanner");
  banner.style.display = "block";
  banner.textContent = `${t("pricedpr.totalLabel")}: ${formatNumber(total)} USD`;
  if (total > BOD_EMAIL_THRESHOLD_USD) {
    banner.style.background = "#fdecea";
    banner.textContent += ` — ${t("pricedpr.overThresholdNote")}`;
  } else {
    banner.style.background = "#f3f4f6";
  }
}

function collectPrLines() {
  return Array.from(document.querySelectorAll(".pr-line-row[data-item-name]")).map((row) => ({
    itemName: row.dataset.itemName,
    quantity: Number(row.dataset.quantity),
    unit: row.dataset.unit,
    unitPriceUsd: Number(row.querySelector(".pr-line-price").value) || 0,
  }));
}

async function submitCreateForm() {
  hideError("createError");
  const purchaseRequisitionId = Number(document.getElementById("f_requisitionId").value);
  const lines = collectPrLines();

  if (!purchaseRequisitionId || lines.length === 0 || lines.some((l) => l.unitPriceUsd <= 0)) {
    showError("createError", t("pricedpr.fillAllFields"));
    return;
  }

  const btn = document.querySelector('#createCard button[onclick="submitCreateForm()"]');
  btn.disabled = true;

  const res = await apiFetch("/purchase-requests", { method: "POST", body: JSON.stringify({ purchaseRequisitionId, lines }) });

  btn.disabled = false;

  if (!res.ok) {
    showError("createError", extractErrorMessage(res.data));
    return;
  }

  toggleCreateForm();
  document.getElementById("linesEditContainer").innerHTML = "";
  document.getElementById("totalBanner").style.display = "none";
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
  const res = await apiFetch(`/purchase-requests/${currentDetailId}`);
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  const r = res.data;
  document.getElementById("detailCode").innerHTML = `${r.code} — ${statusBadge(r.status)}`;

  const user = getCurrentUser();
  const isOwner = user && (user.id === r.createdBy || user.role === "ADMIN");
  const isOverThreshold = Number(r.totalAmountUsd) > BOD_EMAIL_THRESHOLD_USD;
  let actionsHtml = "";
  let thresholdBannerHtml = "";

  if (r.status === "DRAFT" && isOwner) {
    actionsHtml = `
      <button class="btn btn-primary" onclick="doSubmit()">${t("pricedpr.submitBtn")}</button>
      <button class="btn btn-danger" onclick="doDelete()">${t("common.delete")}</button>`;
  } else if (["PENDING_MANAGER_APPROVAL", "PENDING_ACCOUNTANT_APPROVAL"].includes(r.status) && isOwner) {
    actionsHtml = `<button class="btn btn-danger" onclick="doCancel()">${t("pricedpr.cancelBtn")}</button>`;
  }

  if (r.status === "PENDING_MANAGER_APPROVAL" && user && (user.role === "DEPT_HEAD" || user.role === "ADMIN")) {
    if (isOverThreshold) {
      thresholdBannerHtml = `
        <div class="threshold-banner">
          <p>${t("pricedpr.overThresholdWarning")}</p>
          <label style="display:flex; align-items:center; gap:8px; font-weight:400;">
            <input type="checkbox" id="confirmEmailToBod" style="width:auto;" />
            ${t("pricedpr.confirmEmailCheckbox")}
          </label>
        </div>`;
    }
    actionsHtml += `
      <button class="btn btn-success" onclick="doApproveManager(${isOverThreshold})">${t("leave.approveManagerBtn")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("common.reject")}</button>`;
  }
  if (r.status === "PENDING_ACCOUNTANT_APPROVAL" && user && (user.role === "ACCOUNTANT" || user.role === "ADMIN")) {
    actionsHtml += `
      <button class="btn btn-success" onclick="doApproveAccountant()">${t("pricedpr.approveAccountantBtn")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("common.reject")}</button>`;
  }

  const linesHtml = r.lines
    .map(
      (l) => `<tr><td>${l.itemName}</td><td>${formatNumber(l.quantity)}</td><td>${l.unit}</td><td>${formatNumber(l.unitPriceUsd)}</td><td>${formatNumber(l.lineTotalUsd)}</td></tr>`,
    )
    .join("");

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid" style="margin-bottom:16px;">
      <div class="detail-field"><div class="label">${t("pricedpr.requisitionCodeLabel")}</div><div class="value">${r.purchaseRequisition.code}</div></div>
      <div class="detail-field"><div class="label">${t("pricedpr.totalLabel")}</div><div class="value">${formatNumber(r.totalAmountUsd)} USD</div></div>
    </div>
    <table style="margin-bottom:16px;">
      <thead><tr>
        <th>${t("requisition.itemNamePlaceholder")}</th>
        <th>${t("requisition.quantityPlaceholder")}</th>
        <th>${t("requisition.unitPlaceholder")}</th>
        <th>${t("pricedpr.unitPricePlaceholder")}</th>
        <th>${t("pricedpr.lineTotalLabel")}</th>
      </tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
    ${thresholdBannerHtml}
    ${r.rejectionReason ? `<div class="error-box show">${t("disposal.rejectionReasonLabel")}: ${r.rejectionReason}</div>` : ""}
    <div class="btn-row">${actionsHtml}</div>
  `;
}

async function doSubmit() {
  hideError("detailError");
  const res = await apiFetch(`/purchase-requests/${currentDetailId}/submit`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doCancel() {
  if (!confirm(t("pricedpr.cancelConfirm"))) return;
  hideError("detailError");
  const res = await apiFetch(`/purchase-requests/${currentDetailId}/cancel`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doApproveManager(isOverThreshold) {
  hideError("detailError");
  let confirmedEmailToBod = undefined;
  if (isOverThreshold) {
    const checkbox = document.getElementById("confirmEmailToBod");
    if (!checkbox || !checkbox.checked) {
      showError("detailError", t("pricedpr.mustConfirmEmailFirst"));
      return;
    }
    confirmedEmailToBod = true;
  }
  const res = await apiFetch(`/purchase-requests/${currentDetailId}/approve-manager`, {
    method: "POST",
    body: JSON.stringify({ confirmedEmailToBod }),
  });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doApproveAccountant() {
  hideError("detailError");
  const res = await apiFetch(`/purchase-requests/${currentDetailId}/approve-accountant`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  showSuccess("detailSuccess", t("pricedpr.approvedSuccess"));
  await renderDetail();
  await loadList();
}

async function doReject() {
  const reason = prompt(t("disposal.rejectReasonPrompt"));
  if (!reason) return;
  hideError("detailError");
  const res = await apiFetch(`/purchase-requests/${currentDetailId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doDelete() {
  if (!confirm(t("pricedpr.deleteConfirm"))) return;
  hideError("detailError");
  const res = await apiFetch(`/purchase-requests/${currentDetailId}`, { method: "DELETE" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  closeDetail();
  await loadList();
}
