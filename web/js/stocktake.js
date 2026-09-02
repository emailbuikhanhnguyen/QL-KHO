requireAuth();

let warehousesCache = [];
let currentDetailId = null;

(async function init() {
  await loadI18n();
  renderTopbar("stocktake");
  applyTranslations();
  await loadDropdownData();
  await loadList();
})();

async function loadDropdownData() {
  const wh = await apiFetch("/warehouses?limit=100");
  // Loai bo kho he thong (khong phai kho nghiep vu that) khoi dropdown
  const SYSTEM_WAREHOUSE_CODES = ["IN_TRANSIT", "SYSTEM_TEST"];
  warehousesCache = (wh.ok ? wh.data.data : []).filter(
    (w) => !SYSTEM_WAREHOUSE_CODES.includes(w.code)
  );

  const whSelect = document.getElementById("f_warehouseId");
  whSelect.innerHTML = warehousesCache.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");
}

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/stocktakes?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const stocktakes = res.data.data;
  if (stocktakes.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("stocktake.emptyState")}</div>`;
    return;
  }

  const rows = stocktakes
    .map((s) => {
      const warehouse = warehousesCache.find((w) => w.id === s.warehouseId);
      return `
        <tr class="clickable" onclick="openDetail(${s.id})">
          <td><strong>${s.code}</strong></td>
          <td>${warehouse ? warehouse.name : "#" + s.warehouseId}</td>
          <td>${s.lines.length}</td>
          <td>${statusBadge(s.status)}</td>
          <td>${formatDateTime(s.startedAt)}</td>
        </tr>`;
    })
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("stocktake.tableCode")}</th>
        <th>${t("stocktake.tableWarehouse")}</th>
        <th>${t("stocktake.tableLines")}</th>
        <th>${t("stocktake.tableStatus")}</th>
        <th>${t("stocktake.tableDate")}</th>
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
}

async function submitCreateForm() {
  hideError("createError");
  const body = {
    warehouseId: Number(document.getElementById("f_warehouseId").value),
    note: document.getElementById("f_note").value.trim() || undefined,
  };

  const btn = document.getElementById("createSubmitBtn");
  btn.disabled = true;
  btn.textContent = t("common.loading");

  const res = await apiFetch("/stocktakes", { method: "POST", body: JSON.stringify(body) });

  btn.disabled = false;
  btn.textContent = t("stocktake.submitCreateBtn");

  if (!res.ok) {
    showError("createError", extractErrorMessage(res.data));
    return;
  }

  toggleCreateForm();
  document.getElementById("f_note").value = "";
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
  const res = await apiFetch(`/stocktakes/${currentDetailId}`);
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  const s = res.data;
  document.getElementById("detailCode").innerHTML = `${s.code} — ${statusBadge(s.status)}`;

  const warehouse = warehousesCache.find((w) => w.id === s.warehouseId);
  const tolerancePercent = warehouse && warehouse.stocktakeTolerancePercent !== undefined ? Number(warehouse.stocktakeTolerancePercent) : 0;
  const isInProgress = s.status === "IN_PROGRESS";

  const linesHtml = s.lines
    .map((l) => {
      const itemName = l.lot && l.lot.item ? l.lot.item.name : "#" + l.lotId;
      const lotCode = l.lot ? l.lot.lotCode : "";
      const hasCounted = l.countedQuantity !== null && l.countedQuantity !== undefined;
      const systemQty = Number(l.systemQuantity);
      const variance = hasCounted ? Number(l.countedQuantity) - systemQty : null;
      let varianceHtml = "—";
      if (hasCounted) {
        const variancePercent = systemQty === 0 ? (variance === 0 ? 0 : 100) : Math.abs(variance / systemQty) * 100;
        const cls = variancePercent > tolerancePercent ? "variance-bad" : "variance-ok";
        varianceHtml = `<span class="${cls}">${variance > 0 ? "+" : ""}${formatNumber(variance)}</span>`;
      }

      const countedCellHtml = isInProgress
        ? `<input type="number" step="0.001" class="count-input-inline" id="count_${l.id}" value="${hasCounted ? l.countedQuantity : ""}" placeholder="${t("stocktake.notCountedYet")}" />
           <button class="btn btn-outline btn-sm" onclick="saveCount(${l.id})">${t("stocktake.saveCount")}</button>`
        : hasCounted
        ? formatNumber(l.countedQuantity)
        : t("stocktake.notCountedYet");

      return `
        <tr>
          <td>${itemName}</td>
          <td>${lotCode}</td>
          <td>${formatNumber(l.systemQuantity)}</td>
          <td>${countedCellHtml}</td>
          <td>${varianceHtml}</td>
        </tr>`;
    })
    .join("");

  let actionsHtml = "";
  if (isInProgress) {
    const user = getCurrentUser();
    actionsHtml = `
      <button class="btn btn-success" onclick="doComplete()">${t("stocktake.completeBtn")}</button>
      <button class="btn btn-danger" onclick="doCancel()">${t("stocktake.cancelStocktakeBtn")}</button>`;
    if (user && user.role === "ADMIN") {
      actionsHtml += `<button class="btn btn-outline" onclick="doForceComplete()">${t("stocktake.forceCompleteBtn")}</button>`;
    }
  }

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="label">${t("common.warehouse")}</div><div class="value">${warehouse ? warehouse.name : "—"}</div></div>
      <div class="detail-field"><div class="label">${t("stocktake.toleranceLabel")}</div><div class="value">${tolerancePercent}%</div></div>
      <div class="detail-field"><div class="label">${t("common.date")}</div><div class="value">${formatDateTime(s.startedAt)}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>${t("stocktake.linesHeaderItem")}</th>
        <th>${t("stocktake.linesHeaderLotCode")}</th>
        <th>${t("stocktake.linesHeaderSystemQty")}</th>
        <th>${t("stocktake.linesHeaderCountedQty")}</th>
        <th>${t("stocktake.linesHeaderVariance")}</th>
      </tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <div class="btn-row">${actionsHtml}</div>
  `;
}

async function saveCount(lineId) {
  hideError("detailError");
  const input = document.getElementById(`count_${lineId}`);
  const countedQuantity = Number(input.value);
  if (input.value === "" || isNaN(countedQuantity) || countedQuantity < 0) {
    showError("detailError", t("stocktake.invalidCountEntry"));
    return;
  }

  const res = await apiFetch(`/stocktakes/${currentDetailId}/lines/${lineId}`, {
    method: "PUT",
    body: JSON.stringify({ countedQuantity }),
  });
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  await renderDetail();
}

async function doComplete() {
  hideError("detailError");
  const res = await apiFetch(`/stocktakes/${currentDetailId}/complete`, { method: "POST" });
  if (!res.ok) {
    // Truong hop dac biet: vuot dung sai — hien thi ro so dong bi anh huong
    if (res.status === 409 && res.data && Array.isArray(res.data.outOfTolerance)) {
      showError(
        "detailError",
        `${extractErrorMessage(res.data)} (${t("stocktake.toleranceExceededDesc")})`
      );
      return;
    }
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  showSuccess("detailSuccess", t("goodsReceipt.actionSuccess"));
  await renderDetail();
  await loadList();
}

async function doForceComplete() {
  const reason = prompt(t("stocktake.forceCompleteReasonPrompt"));
  if (!reason) return;
  hideError("detailError");
  const res = await apiFetch(`/stocktakes/${currentDetailId}/force-complete`, {
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

async function doCancel() {
  if (!confirm(t("stocktake.cancelConfirm"))) return;
  hideError("detailError");
  const res = await apiFetch(`/stocktakes/${currentDetailId}/cancel`, { method: "POST" });
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  await renderDetail();
  await loadList();
}
