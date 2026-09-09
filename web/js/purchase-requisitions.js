requireAuth();

let currentDetailId = null;
let lineCounter = 0;

(async function init() {
  await loadI18n();
  renderTopbar("purchase-requisition");
  applyTranslations();
  await loadItemNameSuggestions();
  addLine(); // luon co san 1 dong khi mo form
  await loadList();
})();

// -------------------------------------------------------------------------
// GOI Y TEN VAT TU (tu dong theo lich su, khong bat buoc chon dung)
// -------------------------------------------------------------------------
async function loadItemNameSuggestions() {
  const res = await apiFetch("/purchase-requisitions/item-name-suggestions");
  if (!res.ok) return;
  const datalist = document.getElementById("itemNameSuggestions");
  datalist.innerHTML = res.data.map((name) => `<option value="${name}"></option>`).join("");
}

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/purchase-requisitions?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const requests = res.data.data;
  if (requests.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("requisition.emptyState")}</div>`;
    return;
  }

  const rows = requests
    .map(
      (r) => `
        <tr class="clickable" onclick="openDetail(${r.id})">
          <td><strong>${r.code}</strong></td>
          <td>${r.reason}</td>
          <td>${r.lines.length}</td>
          <td>${r.department ? r.department.name : "#" + r.departmentId}</td>
          <td>${statusBadge(r.status)}</td>
        </tr>`,
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("requisition.tableCode")}</th>
        <th>${t("requisition.reasonLabel")}</th>
        <th>${t("requisition.lineCountLabel")}</th>
        <th>${t("common.department")}</th>
        <th>${t("common.status")}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// -------------------------------------------------------------------------
// DONG DONG DONG (them/xoa dong vat tu trong form tao moi)
// -------------------------------------------------------------------------
function addLine() {
  lineCounter++;
  const id = lineCounter;
  const container = document.getElementById("linesContainer");
  const row = document.createElement("div");
  row.className = "line-row";
  row.id = `line-${id}`;
  row.innerHTML = `
    <input type="text" placeholder="${t("requisition.itemNamePlaceholder")}" list="itemNameSuggestions" class="line-itemName" />
    <input type="number" step="0.001" placeholder="${t("requisition.quantityPlaceholder")}" class="line-quantity" />
    <input type="text" placeholder="${t("requisition.unitPlaceholder")}" class="line-unit" />
    <input type="text" placeholder="${t("requisition.notePlaceholder")}" class="line-note" />
    <button type="button" class="remove-line-btn" onclick="removeLine(${id})" title="${t("requisition.removeLineBtn")}">✕</button>
  `;
  container.appendChild(row);
}

function removeLine(id) {
  const row = document.getElementById(`line-${id}`);
  if (row) row.remove();
}

function collectLines() {
  return Array.from(document.querySelectorAll(".line-row"))
    .map((row) => ({
      itemName: row.querySelector(".line-itemName").value.trim(),
      quantity: Number(row.querySelector(".line-quantity").value),
      unit: row.querySelector(".line-unit").value.trim(),
      note: row.querySelector(".line-note").value.trim() || undefined,
    }))
    .filter((l) => l.itemName && l.quantity > 0 && l.unit);
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
  if (isHidden && document.getElementById("linesContainer").children.length === 0) addLine();
}

async function submitCreateForm() {
  hideError("createError");
  const lines = collectLines();
  const reason = document.getElementById("f_reason").value.trim();

  if (!reason || lines.length === 0) {
    showError("createError", t("requisition.fillAllFields"));
    return;
  }

  const btn = document.querySelector('#createCard button[onclick="submitCreateForm()"]');
  btn.disabled = true;

  const res = await apiFetch("/purchase-requisitions", { method: "POST", body: JSON.stringify({ reason, lines }) });

  btn.disabled = false;

  if (!res.ok) {
    showError("createError", extractErrorMessage(res.data));
    return;
  }

  toggleCreateForm();
  document.getElementById("f_reason").value = "";
  document.getElementById("linesContainer").innerHTML = "";
  await loadList();
  await loadItemNameSuggestions();
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
  const res = await apiFetch(`/purchase-requisitions/${currentDetailId}`);
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  const r = res.data;
  document.getElementById("detailCode").innerHTML = `${r.code} — ${statusBadge(r.status)}`;

  const user = getCurrentUser();
  const isOwner = user && (user.id === r.requestedBy || user.role === "ADMIN");
  let actionsHtml = "";

  if (r.status === "DRAFT" && isOwner) {
    actionsHtml = `
      <button class="btn btn-primary" onclick="doSubmit()">${t("requisition.submitBtn")}</button>
      <button class="btn btn-danger" onclick="doDelete()">${t("common.delete")}</button>`;
  } else if (["PENDING_MANAGER_APPROVAL", "PENDING_BOD_APPROVAL"].includes(r.status) && isOwner) {
    actionsHtml = `<button class="btn btn-danger" onclick="doCancel()">${t("requisition.cancelBtn")}</button>`;
  }
  if (r.status === "PENDING_MANAGER_APPROVAL" && user && (user.role === "DEPT_HEAD" || user.role === "ADMIN")) {
    actionsHtml += `
      <button class="btn btn-success" onclick="doApproveManager()">${t("leave.approveManagerBtn")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("common.reject")}</button>`;
  }
  if (r.status === "PENDING_BOD_APPROVAL" && user && (user.role === "BOD" || user.role === "ADMIN")) {
    actionsHtml += `
      <button class="btn btn-success" onclick="doApproveBod()">${t("requisition.approveBodBtn")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("common.reject")}</button>`;
  }

  // Da duyet xong (APPROVED) va nguoi xem la Purchaser -> hien nut noi sang Giai doan 2
  let purchaseRequestLinkHtml = "";
  if (r.status === "APPROVED" && user && (user.role === "PURCHASER" || user.role === "ADMIN")) {
    purchaseRequestLinkHtml = `
      <div class="btn-row" style="margin-top:16px;">
        <a class="btn btn-primary" href="/purchase-requests.html?fromRequisitionId=${r.id}">${t("requisition.createPrBtn")}</a>
      </div>`;
  }

  const linesHtml = r.lines
    .map((l) => `<tr><td>${l.itemName}</td><td>${formatNumber(l.quantity)}</td><td>${l.unit}</td><td>${l.note || "—"}</td></tr>`)
    .join("");

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-field" style="margin-bottom:16px;">
      <div class="label">${t("requisition.reasonLabel")}</div>
      <div class="value" style="font-weight:400;">${r.reason}</div>
    </div>
    <table style="margin-bottom:16px;">
      <thead><tr>
        <th>${t("requisition.itemNamePlaceholder")}</th>
        <th>${t("requisition.quantityPlaceholder")}</th>
        <th>${t("requisition.unitPlaceholder")}</th>
        <th>${t("requisition.notePlaceholder")}</th>
      </tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
    ${r.rejectionReason ? `<div class="error-box show">${t("disposal.rejectionReasonLabel")}: ${r.rejectionReason}</div>` : ""}
    <div class="btn-row">${actionsHtml}</div>
    ${purchaseRequestLinkHtml}
  `;
}

async function doSubmit() {
  hideError("detailError");
  const res = await apiFetch(`/purchase-requisitions/${currentDetailId}/submit`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doCancel() {
  if (!confirm(t("requisition.cancelConfirm"))) return;
  hideError("detailError");
  const res = await apiFetch(`/purchase-requisitions/${currentDetailId}/cancel`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doApproveManager() {
  hideError("detailError");
  const res = await apiFetch(`/purchase-requisitions/${currentDetailId}/approve-manager`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doApproveBod() {
  hideError("detailError");
  const res = await apiFetch(`/purchase-requisitions/${currentDetailId}/approve-bod`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  showSuccess("detailSuccess", t("requisition.approvedSuccess"));
  await renderDetail();
  await loadList();
}

async function doReject() {
  const reason = prompt(t("disposal.rejectReasonPrompt"));
  if (!reason) return;
  hideError("detailError");
  const res = await apiFetch(`/purchase-requisitions/${currentDetailId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doDelete() {
  if (!confirm(t("requisition.deleteConfirm"))) return;
  hideError("detailError");
  const res = await apiFetch(`/purchase-requisitions/${currentDetailId}`, { method: "DELETE" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  closeDetail();
  await loadList();
}
