requireAuth();

let currentDetailId = null;

(async function init() {
  await loadI18n();
  renderTopbar("vehicle");
  applyTranslations();
  await loadList();
})();

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/vehicle-booking-requests?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const requests = res.data.data;
  if (requests.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("vehicle.emptyState")}</div>`;
    return;
  }

  const rows = requests
    .map(
      (r) => `
        <tr class="clickable" onclick="openDetail(${r.id})">
          <td><strong>${r.code}</strong></td>
          <td>${formatDate(r.useDate)}</td>
          <td>${r.startTime} — ${r.endTime}</td>
          <td>${r.departure} → ${r.destination}</td>
          <td>${statusBadge(r.status)}</td>
        </tr>`,
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("vehicle.tableCode")}</th>
        <th>${t("vehicle.dateLabel")}</th>
        <th>${t("vehicle.timeRangeLabel")}</th>
        <th>${t("vehicle.routeLabel")}</th>
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
    useDate: document.getElementById("f_useDate").value,
    startTime: document.getElementById("f_startTime").value,
    endTime: document.getElementById("f_endTime").value,
    departure: document.getElementById("f_departure").value.trim(),
    destination: document.getElementById("f_destination").value.trim(),
    purpose: document.getElementById("f_purpose").value.trim(),
    numberOfPeople: Number(document.getElementById("f_numberOfPeople").value),
  };

  if (!body.useDate || !body.startTime || !body.endTime || !body.departure || !body.destination || !body.purpose || !body.numberOfPeople) {
    showError("createError", t("vehicle.fillAllFields"));
    return;
  }

  const btn = document.querySelector('#createCard button[onclick="submitCreateForm()"]');
  btn.disabled = true;

  const res = await apiFetch("/vehicle-booking-requests", { method: "POST", body: JSON.stringify(body) });

  btn.disabled = false;

  if (!res.ok) {
    showError("createError", extractErrorMessage(res.data));
    return;
  }

  toggleCreateForm();
  document.getElementById("f_purpose").value = "";
  document.getElementById("f_departure").value = "";
  document.getElementById("f_destination").value = "";
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
  const res = await apiFetch(`/vehicle-booking-requests/${currentDetailId}`);
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
      <button class="btn btn-primary" onclick="doSubmit()">${t("vehicle.submitBtn")}</button>
      <button class="btn btn-danger" onclick="doDelete()">${t("common.delete")}</button>`;
  } else if (["PENDING_MANAGER_APPROVAL", "PENDING_ADMIN_APPROVAL"].includes(r.status) && isOwner) {
    actionsHtml = `<button class="btn btn-danger" onclick="doCancel()">${t("vehicle.cancelBtn")}</button>`;
  }
  if (r.status === "PENDING_MANAGER_APPROVAL" && user && (user.role === "DEPT_HEAD" || user.role === "ADMIN")) {
    actionsHtml += `
      <button class="btn btn-success" onclick="doApproveManager()">${t("leave.approveManagerBtn")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("common.reject")}</button>`;
  }
  if (r.status === "PENDING_ADMIN_APPROVAL" && user && user.role === "ADMIN") {
    actionsHtml += `
      <button class="btn btn-success" onclick="doApproveAdmin()">${t("vehicle.approveAdminBtn")}</button>
      <button class="btn btn-danger" onclick="doReject()">${t("common.reject")}</button>`;
  }

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="label">${t("vehicle.dateLabel")}</div><div class="value">${formatDate(r.useDate)}</div></div>
      <div class="detail-field"><div class="label">${t("vehicle.timeRangeLabel")}</div><div class="value">${r.startTime} — ${r.endTime}</div></div>
      <div class="detail-field"><div class="label">${t("vehicle.departureLabel")}</div><div class="value">${r.departure}</div></div>
      <div class="detail-field"><div class="label">${t("vehicle.destinationLabel")}</div><div class="value">${r.destination}</div></div>
      <div class="detail-field"><div class="label">${t("vehicle.numberOfPeopleLabel")}</div><div class="value">${r.numberOfPeople}</div></div>
      <div class="detail-field"><div class="label">${t("common.department")}</div><div class="value">${r.department ? r.department.name : "—"}</div></div>
    </div>
    <div class="detail-field" style="margin-bottom:16px;">
      <div class="label">${t("vehicle.purposeLabel")}</div>
      <div class="value" style="font-weight:400;">${r.purpose}</div>
    </div>
    ${r.rejectionReason ? `<div class="error-box show">${t("disposal.rejectionReasonLabel")}: ${r.rejectionReason}</div>` : ""}
    <div class="btn-row">${actionsHtml}</div>
  `;
}

async function doSubmit() {
  hideError("detailError");
  const res = await apiFetch(`/vehicle-booking-requests/${currentDetailId}/submit`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doCancel() {
  if (!confirm(t("vehicle.cancelConfirm"))) return;
  hideError("detailError");
  const res = await apiFetch(`/vehicle-booking-requests/${currentDetailId}/cancel`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doApproveManager() {
  hideError("detailError");
  const res = await apiFetch(`/vehicle-booking-requests/${currentDetailId}/approve-manager`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doApproveAdmin() {
  hideError("detailError");
  const res = await apiFetch(`/vehicle-booking-requests/${currentDetailId}/approve-admin`, { method: "POST" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  showSuccess("detailSuccess", t("vehicle.approvedSuccess"));
  await renderDetail();
  await loadList();
}

async function doReject() {
  const reason = prompt(t("disposal.rejectReasonPrompt"));
  if (!reason) return;
  hideError("detailError");
  const res = await apiFetch(`/vehicle-booking-requests/${currentDetailId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  await renderDetail();
  await loadList();
}

async function doDelete() {
  if (!confirm(t("vehicle.deleteConfirm"))) return;
  hideError("detailError");
  const res = await apiFetch(`/vehicle-booking-requests/${currentDetailId}`, { method: "DELETE" });
  if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
  closeDetail();
  await loadList();
}
