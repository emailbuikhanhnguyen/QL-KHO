requireAuth();

let warehousesCache = [];
let itemsCache = [];
let lineCounter = 0;

(async function init() {
  await loadI18n();
  renderTopbar("issue");
  applyTranslations();
  await loadDropdownData();
  await loadList();
})();

async function loadDropdownData() {
  const [wh, it] = await Promise.all([
    apiFetch("/warehouses?limit=100"),
    apiFetch("/items?limit=100"),
  ]);
  const SYSTEM_WAREHOUSE_CODES = ["IN_TRANSIT", "SYSTEM_TEST"];
  warehousesCache = (wh.ok ? wh.data.data : []).filter(
    (w) => !SYSTEM_WAREHOUSE_CODES.includes(w.code)
  );
  itemsCache = it.ok ? it.data.data : [];

  const whSelect = document.getElementById("f_warehouseId");
  whSelect.innerHTML = warehousesCache.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");
}

function itemName(itemId) {
  const item = itemsCache.find((i) => i.id === itemId);
  return item ? `${item.name} (${item.code})` : `#${itemId}`;
}

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/issue-requests?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const requests = res.data.data;
  if (requests.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("issueRequest.emptyState")}</div>`;
    return;
  }

  const rows = requests
    .map((r) => {
      const warehouse = warehousesCache.find((w) => w.id === r.warehouseId);
      return `
        <tr class="clickable" onclick="openDetail(${r.id})">
          <td><strong>${r.code}</strong></td>
          <td>${warehouse ? warehouse.name : "#" + r.warehouseId}</td>
          <td>${r.lines.length} ${t("issueRequest.lineCount")}</td>
          <td>${statusBadge(r.status)}</td>
          <td>${formatDateTime(r.createdAt)}</td>
        </tr>`;
    })
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("issueRequest.tableCode")}</th>
        <th>${t("issueRequest.tableWarehouse")}</th>
        <th>${t("issueRequest.tableLines")}</th>
        <th>${t("issueRequest.tableStatus")}</th>
        <th>${t("issueRequest.tableDate")}</th>
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
    <button class="remove-line" onclick="removeLine(${id})">${t("issueRequest.removeLine")}</button>
    <div class="form-grid">
      <div class="form-row">
        <label>${t("issueRequest.itemLabel")}</label>
        <select id="line_${id}_itemId">${itemOptions}</select>
      </div>
      <div class="form-row">
        <label>${t("issueRequest.quantityLabel")}</label>
        <input type="number" id="line_${id}_quantity" min="0.001" step="0.001" />
      </div>
    </div>
    <div class="form-row">
      <label>${t("issueRequest.noteLabel")}</label>
      <input type="text" id="line_${id}_note" />
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
    const requestedQuantity = Number(document.getElementById(`line_${id}_quantity`).value);
    const note = document.getElementById(`line_${id}_note`).value.trim();
    if (!requestedQuantity) continue;
    const line = { itemId, requestedQuantity };
    if (note) line.note = note;
    lines.push(line);
  }
  return lines;
}

async function submitCreateForm() {
  hideError("createError");
  const lines = collectLines();
  if (lines.length === 0) {
    showError("createError", t("issueRequest.needAtLeastOneLine"));
    return;
  }

  const body = {
    warehouseId: Number(document.getElementById("f_warehouseId").value),
    reason: document.getElementById("f_reason").value.trim() || undefined,
    lines,
  };

  const btn = document.getElementById("createSubmitBtn");
  btn.disabled = true;
  btn.textContent = t("common.loading");

  const res = await apiFetch("/issue-requests", { method: "POST", body: JSON.stringify(body) });

  btn.disabled = false;
  btn.textContent = t("issueRequest.submitCreateBtn");

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
// CHI TIET + HANH DONG THEO TUNG CAP DUYET
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
  const res = await apiFetch(`/issue-requests/${currentDetailId}`);
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  const r = res.data;
  document.getElementById("detailCode").innerHTML = `${r.code} — ${statusBadge(r.status)}`;

  const warehouse = warehousesCache.find((w) => w.id === r.warehouseId);

  const linesHtml = r.lines
    .map(
      (l) => `
      <tr>
        <td>${l.item ? l.item.name : itemName(l.itemId)}</td>
        <td>${formatNumber(l.requestedQuantity)}</td>
        <td>${l.issuedQuantity !== null && l.issuedQuantity !== undefined ? formatNumber(l.issuedQuantity) : "—"}</td>
        <td>${l.note || "—"}</td>
      </tr>`
    )
    .join("");

  let actionsHtml = "";
  if (r.status === "DRAFT") {
    actionsHtml = `
      <button class="btn btn-primary" onclick="doAction('submit')">${t("issueRequest.submitForApproval")}</button>
      <button class="btn btn-danger" onclick="doDelete()">${t("issueRequest.deleteRequest")}</button>`;
  } else if (r.status === "PENDING_HEAD_APPROVAL") {
    actionsHtml = `
      <button class="btn btn-success" onclick="doAction('approve-head')">${t("issueRequest.approveHead")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("issueRequest.reject")}</button>`;
  } else if (r.status === "PENDING_BOD_APPROVAL") {
    actionsHtml = `
      <button class="btn btn-success" onclick="doAction('approve-bod')">${t("issueRequest.approveBod")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("issueRequest.reject")}</button>`;
  } else if (r.status === "APPROVED") {
    actionsHtml = `<button class="btn btn-primary" onclick="doAction('issue')">${t("issueRequest.issueBtn")}</button>`;
  } else if (r.status === "REJECTED") {
    actionsHtml = `<button class="btn btn-secondary" onclick="doAction('reopen')">${t("issueRequest.reopen")}</button>`;
  }

  // Thanh tien trinh truc quan qua 5 giai doan
  const stages = ["DRAFT", "PENDING_HEAD_APPROVAL", "PENDING_BOD_APPROVAL", "APPROVED", "ISSUED"];
  const currentIdx = r.status === "REJECTED" ? -1 : stages.indexOf(r.status);
  const progressHtml = r.status === "REJECTED"
    ? `<div class="badge badge-danger" style="font-size:13px;">${t("issueRequest.stage.REJECTED")}</div>`
    : stages
        .map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const cls = done ? "badge-success" : active ? "badge-info" : "badge-gray";
          return `<span class="badge ${cls}">${i + 1}. ${t("issueRequest.stage." + s)}</span>`;
        })
        .join(" → ");

  document.getElementById("detailContainer").innerHTML = `
    <div style="margin-bottom: 16px; line-height: 2.2;">${progressHtml}</div>
    <div class="detail-grid">
      <div class="detail-field"><div class="label">${t("issueRequest.detailWarehouse")}</div><div class="value">${warehouse ? warehouse.name : "—"}</div></div>
      <div class="detail-field"><div class="label">${t("issueRequest.detailReason")}</div><div class="value">${r.reason || "—"}</div></div>
      <div class="detail-field"><div class="label">${t("issueRequest.detailDate")}</div><div class="value">${formatDateTime(r.createdAt)}</div></div>
    </div>
    ${r.rejectedReason ? `<div class="error-box show">${t("issueRequest.rejectedReasonLabel")}: ${r.rejectedReason}</div>` : ""}
    <h3>${t("issueRequest.linesTitle")}</h3>
    <table>
      <thead><tr>
        <th>${t("issueRequest.tableItem")}</th>
        <th>${t("issueRequest.tableRequestedQty")}</th>
        <th>${t("issueRequest.tableIssuedQty")}</th>
        <th>${t("issueRequest.tableNote")}</th>
      </tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <div class="btn-row">${actionsHtml}</div>
  `;
}

async function doAction(action) {
  hideError("detailError");
  const res = await apiFetch(`/issue-requests/${currentDetailId}/${action}`, { method: "POST" });
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  showSuccess("detailSuccess", t("issueRequest.actionSuccess"));
  await renderDetail();
  await loadList();
}

async function doReject() {
  const reason = prompt(t("issueRequest.rejectReasonPrompt"));
  if (!reason) return;
  hideError("detailError");
  const res = await apiFetch(`/issue-requests/${currentDetailId}/reject`, {
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
  if (!confirm(t("issueRequest.deleteConfirm"))) return;
  const res = await apiFetch(`/issue-requests/${currentDetailId}`, { method: "DELETE" });
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  closeDetail();
  await loadList();
}
