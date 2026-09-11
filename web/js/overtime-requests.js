requireAuth();

let usersCache = [];
let currentDetailId = null;

(async function init() {
  await loadI18n();
  renderTopbar("overtime");
  applyTranslations();
  await loadDropdownData();
  await loadList();

  // Ho tro mo san 1 phieu cu the qua ?open=<id> — dung khi bam tu trang
  // "Viec can toi duyet" sang, de khong phai tim lai phieu trong danh sach.
  const openId = new URLSearchParams(window.location.search).get("open");
  if (openId) openDetail(Number(openId));

})();

async function loadDropdownData() {
  const user = getCurrentUser();
  // Chi hien nhan vien CUNG phong ban (dung khop kiem tra o backend) — tru
  // Admin thi xem duoc toan bo (nhung o day don gian hoa, van loc theo
  // phong ban cua Admin dang dang nhap; Admin co the doi qua Swagger neu
  // can chon khac phong ban).
  const res = await apiFetch(`/auth/users?departmentId=${user.departmentId}`);
  usersCache = res.ok ? res.data : [];

  const container = document.getElementById("userCheckboxList");
  container.innerHTML = usersCache
    .map(
      (u) => `
      <label>
        <input type="checkbox" value="${u.id}" class="user-checkbox" />
        ${u.fullName} (${u.email})
      </label>`,
    )
    .join("");
}

function userName(id) {
  const u = usersCache.find((x) => x.id === id);
  return u ? u.fullName : "#" + id;
}

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/overtime-requests?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const requests = res.data.data;
  if (requests.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("overtime.emptyState")}</div>`;
    return;
  }

  const rows = requests
    .map(
      (r) => `
        <tr class="clickable" onclick="openDetail(${r.id})">
          <td><strong>${r.code}</strong></td>
          <td>${formatDate(r.otDate)}</td>
          <td>${r.startTime} — ${r.endTime}</td>
          <td>${r.lines.length}</td>
          <td>${r.department ? r.department.name : "#" + r.departmentId}</td>
          <td>${statusBadge(r.status)}</td>
        </tr>`,
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("overtime.tableCode")}</th>
        <th>${t("overtime.dateLabel")}</th>
        <th>${t("overtime.timeRangeLabel")}</th>
        <th>${t("overtime.peopleCountLabel")}</th>
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
  const userIds = Array.from(document.querySelectorAll(".user-checkbox:checked")).map((cb) => Number(cb.value));

  const body = {
    otDate: document.getElementById("f_otDate").value,
    startTime: document.getElementById("f_startTime").value,
    endTime: document.getElementById("f_endTime").value,
    reason: document.getElementById("f_reason").value.trim(),
    userIds,
  };

  if (!body.otDate || !body.startTime || !body.endTime || !body.reason || userIds.length === 0) {
    showError("createError", t("overtime.fillAllFields"));
    return;
  }

  const btn = document.querySelector('#createCard button[onclick="submitCreateForm()"]');
  btn.disabled = true;

  const res = await apiFetch("/overtime-requests", { method: "POST", body: JSON.stringify(body) });

  btn.disabled = false;

  if (!res.ok) {
    showError("createError", extractErrorMessage(res.data));
    return;
  }

  toggleCreateForm();
  document.getElementById("f_reason").value = "";
  document.querySelectorAll(".user-checkbox:checked").forEach((cb) => (cb.checked = false));
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
  const res = await apiFetch(`/overtime-requests/${currentDetailId}`);
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
      <button class="btn btn-primary" onclick="doSubmit()">${t("overtime.submitBtn")}</button>
      <button class="btn btn-danger" onclick="doDelete()">${t("common.delete")}</button>`;
  } else if (["PENDING_MANAGER_APPROVAL", "PENDING_HR_APPROVAL"].includes(r.status) && isOwner) {
    actionsHtml = `<button class="btn btn-danger" onclick="doCancel()">${t("overtime.cancelBtn")}</button>`;
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

  // Neu usersCache trong (VD: xem chi tiet phieu cua phong ban khac), tra
  // cuu ten truc tiep tu API rieng cho tung id — don gian hoa: hien ID neu
  // khong tim thay trong cache hien co (thuong la cung phong ban nen se co).
  const peopleHtml = r.lines.map((l) => `<span class="badge">${userName(l.userId)}</span>`).join(" ");

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="label">${t("overtime.dateLabel")}</div><div class="value">${formatDate(r.otDate)}</div></div>
      <div class="detail-field"><div class="label">${t("overtime.timeRangeLabel")}</div><div class="value">${r.startTime} — ${r.endTime}</div></div>
      <div class="detail-field"><div class="label">${t("common.department")}</div><div class="value">${r.department ? r.department.name : "—"}</div></div>
    </div>
    <div class="detail-field" style="margin-bottom:12px;">
      <div class="label">${t("overtime.reasonLabel")}</div>
      <div class="value" style="font-weight:400;">${r.reason}</div>
    </div>
    <div class="detail-field" style="margin-bottom:16px;">
      <div class="label">${t("overtime.usersLabel")}</div>
      <div class="value" style="font-weight:400;">${peopleHtml}</div>
    </div>
    ${r.rejectionReason ? `<div class="error-box show">${t("disposal.rejectionReasonLabel")}: ${r.rejectionReason}</div>` : ""}
    <div class="btn-row">${actionsHtml}</div>
  `;
}

async function doSubmit() {
  hideError("detailError");
  const res = await apiFetch(`/overtime-requests/${currentDetailId}/submit`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doCancel() {
  if (!confirm(t("overtime.cancelConfirm"))) return;
  hideError("detailError");
  const res = await apiFetch(`/overtime-requests/${currentDetailId}/cancel`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doApproveManager() {
  hideError("detailError");
  const res = await apiFetch(`/overtime-requests/${currentDetailId}/approve-manager`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doApproveHr() {
  hideError("detailError");
  const res = await apiFetch(`/overtime-requests/${currentDetailId}/approve-hr`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  showSuccess("detailSuccess", t("overtime.approvedSuccess"));
  await renderDetail();
  await loadList();
}

async function doReject() {
  const reason = prompt(t("disposal.rejectReasonPrompt"));
  if (!reason) return;
  hideError("detailError");
  const res = await apiFetch(`/overtime-requests/${currentDetailId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doDelete() {
  if (!confirm(t("overtime.deleteConfirm"))) return;
  hideError("detailError");
  const res = await apiFetch(`/overtime-requests/${currentDetailId}`, { method: "DELETE" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  closeDetail();
  await loadList();
}
