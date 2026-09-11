requireAuth();

let currentDetailId = null;

(async function init() {
  await loadI18n();
  renderTopbar("leave");
  applyTranslations();
  await loadList();

  // Ho tro mo san 1 phieu cu the qua ?open=<id> — dung khi bam tu trang
  // "Viec can toi duyet" sang, de khong phai tim lai phieu trong danh sach.
  const openId = new URLSearchParams(window.location.search).get("open");
  if (openId) openDetail(Number(openId));

})();

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/leave-requests?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const requests = res.data.data;
  if (requests.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("leave.emptyState")}</div>`;
    return;
  }

  const rows = requests
    .map(
      (r) => `
        <tr class="clickable" onclick="openDetail(${r.id})">
          <td><strong>${r.code}</strong></td>
          <td>${t("leave.type" + r.leaveType.charAt(0) + r.leaveType.slice(1).toLowerCase())}</td>
          <td>${formatDate(r.startDate)} — ${formatDate(r.endDate)}</td>
          <td>${r.department ? r.department.name : "#" + r.departmentId}</td>
          <td>${statusBadge(r.status)}</td>
        </tr>`,
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("leave.tableCode")}</th>
        <th>${t("leave.typeLabel")}</th>
        <th>${t("leave.dateRangeLabel")}</th>
        <th>${t("common.department")}</th>
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
}

async function submitCreateForm() {
  hideError("createError");
  const body = {
    leaveType: document.getElementById("f_leaveType").value,
    startDate: document.getElementById("f_startDate").value,
    endDate: document.getElementById("f_endDate").value,
    reason: document.getElementById("f_reason").value.trim(),
  };

  if (!body.startDate || !body.endDate || !body.reason) {
    showError("createError", t("leave.fillAllFields"));
    return;
  }

  const btn = document.querySelector('#createCard button[onclick="submitCreateForm()"]');
  btn.disabled = true;

  const res = await apiFetch("/leave-requests", { method: "POST", body: JSON.stringify(body) });

  btn.disabled = false;

  if (!res.ok) {
    showError("createError", extractErrorMessage(res.data));
    return;
  }

  toggleCreateForm();
  document.getElementById("f_reason").value = "";
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
  const res = await apiFetch(`/leave-requests/${currentDetailId}`);
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
      <button class="btn btn-primary" onclick="doSubmit()">${t("leave.submitBtn")}</button>
      <button class="btn btn-danger" onclick="doDelete()">${t("common.delete")}</button>`;
  } else if (["PENDING_MANAGER_APPROVAL", "PENDING_HR_APPROVAL"].includes(r.status) && isOwner) {
    actionsHtml = `<button class="btn btn-danger" onclick="doCancel()">${t("leave.cancelBtn")}</button>`;
  }
  if (r.status === "PENDING_MANAGER_APPROVAL" && user && (user.role === "DEPT_HEAD" || user.role === "ADMIN")) {
    actionsHtml += `
      <button class="btn btn-success" onclick="doApproveManager()">${t("leave.approveManagerBtn")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("common.reject")}</button>`;
  }
  if (r.status === "PENDING_HR_APPROVAL" && user && (user.role === "HR" || user.role === "ADMIN")) {
    actionsHtml += `
      <button class="btn btn-success" onclick="doApproveHr()">${t("leave.approveHrBtn")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("common.reject")}</button>`;
  }

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="label">${t("leave.typeLabel")}</div><div class="value">${t("leave.type" + r.leaveType.charAt(0) + r.leaveType.slice(1).toLowerCase())}</div></div>
      <div class="detail-field"><div class="label">${t("leave.dateRangeLabel")}</div><div class="value">${formatDate(r.startDate)} — ${formatDate(r.endDate)}</div></div>
      <div class="detail-field"><div class="label">${t("common.department")}</div><div class="value">${r.department ? r.department.name : "—"}</div></div>
    </div>
    <div class="detail-field" style="margin-bottom:16px;">
      <div class="label">${t("leave.reasonLabel")}</div>
      <div class="value" style="font-weight:400;">${r.reason}</div>
    </div>
    ${r.rejectionReason ? `<div class="error-box show">${t("disposal.rejectionReasonLabel")}: ${r.rejectionReason}</div>` : ""}
    <div class="btn-row">${actionsHtml}</div>
  `;
}

async function doSubmit() {
  hideError("detailError");
  const res = await apiFetch(`/leave-requests/${currentDetailId}/submit`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doCancel() {
  if (!confirm(t("leave.cancelConfirm"))) return;
  hideError("detailError");
  const res = await apiFetch(`/leave-requests/${currentDetailId}/cancel`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doApproveManager() {
  hideError("detailError");
  const res = await apiFetch(`/leave-requests/${currentDetailId}/approve-manager`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doApproveHr() {
  hideError("detailError");
  const res = await apiFetch(`/leave-requests/${currentDetailId}/approve-hr`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  showSuccess("detailSuccess", t("leave.approvedSuccess"));
  await renderDetail();
  await loadList();
}

async function doReject() {
  const reason = prompt(t("disposal.rejectReasonPrompt"));
  if (!reason) return;
  hideError("detailError");
  const res = await apiFetch(`/leave-requests/${currentDetailId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doDelete() {
  if (!confirm(t("leave.deleteConfirm"))) return;
  hideError("detailError");
  const res = await apiFetch(`/leave-requests/${currentDetailId}`, { method: "DELETE" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  closeDetail();
  await loadList();
}
