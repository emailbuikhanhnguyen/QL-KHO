requireAuth();

let warehousesCache = [];
let lotsCache = [];
let itemsCache = [];
let lineCounter = 0;

(async function init() {
  await loadI18n();
  renderTopbar("transfer");
  applyTranslations();
  await loadDropdownData();
  await loadList();
})();

async function loadDropdownData() {
  const [wh, lots, items] = await Promise.all([
    apiFetch("/warehouses?limit=100"),
    apiFetch("/lots?limit=100"),
    apiFetch("/items?limit=100"),
  ]);
  warehousesCache = wh.ok ? wh.data.data : [];
  lotsCache = lots.ok ? lots.data.data : [];
  itemsCache = items.ok ? items.data.data : [];

  const srcSelect = document.getElementById("f_sourceWarehouseId");
  const dstSelect = document.getElementById("f_destWarehouseId");
  const options = warehousesCache
    .filter((w) => w.code !== "IN_TRANSIT" && w.code !== "SYSTEM_TEST") // khong cho chon lam nguon/dich thu cong
    .map((w) => `<option value="${w.id}">${w.name}</option>`)
    .join("");
  srcSelect.innerHTML = options;
  dstSelect.innerHTML = options;
}

function warehouseName(id) {
  const w = warehousesCache.find((x) => x.id === id);
  return w ? w.name : `#${id}`;
}

function lotLabel(lotId) {
  const lot = lotsCache.find((l) => l.id === lotId);
  if (!lot) return `Lot #${lotId}`;
  const item = itemsCache.find((i) => i.id === lot.itemId);
  return `${lot.lotCode} — ${item ? item.name : "#" + lot.itemId}`;
}

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/warehouse-transfers?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const transfers = res.data.data;
  if (transfers.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("transfer.emptyState")}</div>`;
    return;
  }

  const rows = transfers
    .map(
      (t2) => `
      <tr class="clickable" onclick="openDetail(${t2.id})">
        <td><strong>${t2.code}</strong></td>
        <td>${warehouseName(t2.sourceWarehouseId)} → ${warehouseName(t2.destWarehouseId)}</td>
        <td>${t2.lines.length}</td>
        <td>${statusBadge(t2.status)}</td>
        <td>${formatDateTime(t2.createdAt)}</td>
      </tr>`
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("transfer.tableCode")}</th>
        <th>${t("transfer.tableRoute")}</th>
        <th>${t("transfer.tableLines")}</th>
        <th>${t("transfer.tableStatus")}</th>
        <th>${t("transfer.tableDate")}</th>
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
  const lotOptions = lotsCache.map((l) => `<option value="${l.id}">${lotLabel(l.id)}</option>`).join("");

  const div = document.createElement("div");
  div.className = "line-item";
  div.id = `line_${id}`;
  div.innerHTML = `
    <button class="remove-line" onclick="removeLine(${id})">${t("transfer.removeLine")}</button>
    <div class="form-grid">
      <div class="form-row">
        <label>${t("transfer.lotLabel")}</label>
        <select id="line_${id}_lotId">${lotOptions}</select>
      </div>
      <div class="form-row">
        <label>${t("transfer.quantityLabel")}</label>
        <input type="number" id="line_${id}_quantity" min="0.001" step="0.001" />
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
    const lotId = Number(document.getElementById(`line_${id}_lotId`).value);
    const quantity = Number(document.getElementById(`line_${id}_quantity`).value);
    if (!quantity) continue;
    lines.push({ lotId, quantity });
  }
  return lines;
}

async function submitCreateForm() {
  hideError("createError");
  const sourceWarehouseId = Number(document.getElementById("f_sourceWarehouseId").value);
  const destWarehouseId = Number(document.getElementById("f_destWarehouseId").value);

  if (sourceWarehouseId === destWarehouseId) {
    showError("createError", t("transfer.sourceDestMustDiffer"));
    return;
  }

  const lines = collectLines();
  if (lines.length === 0) {
    showError("createError", t("transfer.needAtLeastOneLine"));
    return;
  }

  const body = {
    sourceWarehouseId,
    destWarehouseId,
    reason: document.getElementById("f_reason").value.trim() || undefined,
    lines,
  };

  const btn = document.getElementById("createSubmitBtn");
  btn.disabled = true;
  btn.textContent = t("common.loading");

  const res = await apiFetch("/warehouse-transfers", { method: "POST", body: JSON.stringify(body) });

  btn.disabled = false;
  btn.textContent = t("transfer.submitCreateBtn");

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
// CHI TIET
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
  const res = await apiFetch(`/warehouse-transfers/${currentDetailId}`);
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  const tr = res.data;
  document.getElementById("detailCode").innerHTML = `${tr.code} — ${statusBadge(tr.status)}`;

  const linesHtml = tr.lines
    .map(
      (l) => `
      <tr>
        <td>${lotLabel(l.lotId)}</td>
        <td>${formatNumber(l.quantity)}</td>
      </tr>`
    )
    .join("");

  let actionsHtml = "";
  if (tr.status === "DRAFT") {
    actionsHtml = `
      <button class="btn btn-primary" onclick="doAction('ship')">${t("transfer.shipBtn")}</button>
      <button class="btn btn-danger" onclick="doDelete()">${t("transfer.deleteBtn")}</button>`;
  } else if (tr.status === "SHIPPED") {
    actionsHtml = `<button class="btn btn-success" onclick="doAction('receive')">${t("transfer.receiveBtn")}</button>`;
  }

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="label">${t("transfer.detailSource")}</div><div class="value">${warehouseName(tr.sourceWarehouseId)}</div></div>
      <div class="detail-field"><div class="label">${t("transfer.detailDest")}</div><div class="value">${warehouseName(tr.destWarehouseId)}</div></div>
      <div class="detail-field"><div class="label">${t("transfer.detailReason")}</div><div class="value">${tr.reason || "—"}</div></div>
      <div class="detail-field"><div class="label">${t("transfer.detailDate")}</div><div class="value">${formatDateTime(tr.createdAt)}</div></div>
    </div>
    <h3>${t("transfer.linesTitle")}</h3>
    <table>
      <thead><tr><th>${t("transfer.tableLot")}</th><th>${t("transfer.tableQty")}</th></tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <div class="btn-row">${actionsHtml}</div>
  `;
}

async function doAction(action) {
  hideError("detailError");
  const res = await apiFetch(`/warehouse-transfers/${currentDetailId}/${action}`, { method: "POST" });
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  showSuccess("detailSuccess", t("transfer.actionSuccess"));
  await renderDetail();
  await loadList();
}

async function doDelete() {
  if (!confirm(t("transfer.deleteConfirm"))) return;
  const res = await apiFetch(`/warehouse-transfers/${currentDetailId}`, { method: "DELETE" });
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  closeDetail();
  await loadList();
}
