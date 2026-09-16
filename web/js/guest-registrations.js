requireAuth();

let currentDetailId = null;

(async function init() {
  await loadI18n();
  renderTopbar("guest");
  applyTranslations();
  await loadList();
})();

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/guest-registrations?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const items = res.data.data;
  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("guest.emptyState")}</div>`;
    return;
  }

  const rows = items
    .map(
      (r) => `
        <tr class="clickable" onclick="openDetail(${r.id})">
          <td><strong>${r.code}</strong></td>
          <td>${escapeHtml(r.visitorFullName)}</td>
          <td>${escapeHtml(r.companyName)}</td>
          <td>${formatDate(r.startDate)} → ${formatDate(r.endDate)}</td>
          <td>${r.department ? escapeHtml(r.department.name) : "#" + r.departmentId}</td>
          <td>${statusBadge(r.status)}</td>
        </tr>`,
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("guest.tableCode")}</th>
        <th>${t("guest.visitorNameLabel")}</th>
        <th>${t("guest.companyNameLabel")}</th>
        <th>${t("guest.dateRangeLabel")}</th>
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
  const visitorFullName = document.getElementById("f_visitorFullName").value.trim();
  const idNumber = document.getElementById("f_idNumber").value.trim();
  const companyName = document.getElementById("f_companyName").value.trim();
  const startDate = document.getElementById("f_startDate").value;
  const endDate = document.getElementById("f_endDate").value;
  const purpose = document.getElementById("f_purpose").value.trim();

  if (!visitorFullName || !idNumber || !companyName || !startDate || !endDate) {
    showError("createError", t("guest.fillAllFields"));
    return;
  }

  const btn = document.querySelector('#createCard button[onclick="submitCreateForm()"]');
  btn.disabled = true;

  const res = await apiFetch("/guest-registrations", {
    method: "POST",
    body: JSON.stringify({ visitorFullName, idNumber, companyName, startDate, endDate, purpose: purpose || undefined }),
  });

  btn.disabled = false;

  if (!res.ok) {
    showError("createError", extractErrorMessage(res.data));
    return;
  }

  toggleCreateForm();
  ["f_visitorFullName", "f_idNumber", "f_companyName", "f_startDate", "f_endDate", "f_purpose"].forEach(
    (id) => (document.getElementById(id).value = ""),
  );
  await loadList();
  openDetail(res.data.id);
}

// -------------------------------------------------------------------------
// CHI TIET — 2 cap duyet co dinh (Quan ly -> BOD), kem QR sau khi da duyet
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
  const res = await apiFetch(`/guest-registrations/${currentDetailId}`);
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  const r = res.data;
  document.getElementById("detailCode").innerHTML = `${r.code} — ${statusBadge(r.status)}`;

  const user = getCurrentUser();
  const isOwner = user && (user.id === r.requestedBy || user.role === "ADMIN");
  const isMyDeptHead = user && (user.role === "ADMIN" || (user.role === "DEPT_HEAD" && user.departmentId === r.departmentId));
  const isBod = user && (user.role === "ADMIN" || user.role === "BOD");

  let actionsHtml = "";
  if (r.status === "DRAFT" && isOwner) {
    actionsHtml = `
      <button class="btn btn-primary" onclick="doSubmit(event)">${t("guest.submitBtn")}</button>
      <button class="btn btn-danger" onclick="doDelete(event)">${t("common.delete")}</button>`;
  }
  if (["DRAFT", "PENDING_MANAGER_APPROVAL", "PENDING_BOD_APPROVAL"].includes(r.status) && isOwner) {
    actionsHtml += `<button class="btn btn-danger" onclick="doCancel(event)">${t("guest.cancelBtn")}</button>`;
  }
  if (r.status === "PENDING_MANAGER_APPROVAL" && isMyDeptHead) {
    actionsHtml += `
      <button class="btn btn-success" onclick="doApproveManager(event)">${t("guest.approveBtn")}</button>
      <button class="btn btn-danger" onclick="doReject(event)">${t("common.reject")}</button>`;
  }
  if (r.status === "PENDING_BOD_APPROVAL" && isBod) {
    actionsHtml += `
      <button class="btn btn-success" onclick="doApproveBod(event)">${t("guest.approveBtn")}</button>
      <button class="btn btn-danger" onclick="doReject(event)">${t("common.reject")}</button>`;
  }

  const checkInsHtml =
    r.checkIns && r.checkIns.length
      ? `<label style="font-weight:600; display:block; margin:16px 0 4px;">${t("guest.checkInHistoryLabel")}</label>` +
        r.checkIns
          .map((c) => `<div class="line-item">${formatDateTime(c.checkedInAt)} — ${escapeHtml(c.checkedInByName || "#" + c.checkedInBy)}${c.notes ? " · " + escapeHtml(c.notes) : ""}</div>`)
          .join("")
      : "";

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="label">${t("guest.visitorNameLabel")}</div><div class="value" style="font-weight:400;">${escapeHtml(r.visitorFullName)}</div></div>
      <div class="detail-field"><div class="label">${t("guest.idNumberLabel")}</div><div class="value" style="font-weight:400;">${escapeHtml(r.idNumber)}</div></div>
      <div class="detail-field"><div class="label">${t("guest.companyNameLabel")}</div><div class="value" style="font-weight:400;">${escapeHtml(r.companyName)}</div></div>
      <div class="detail-field"><div class="label">${t("guest.dateRangeLabel")}</div><div class="value">${formatDate(r.startDate)} → ${formatDate(r.endDate)}</div></div>
      <div class="detail-field"><div class="label">${t("common.department")}</div><div class="value">${r.department ? escapeHtml(r.department.name) : "—"}</div></div>
    </div>
    ${r.purpose ? `<p><strong>${t("guest.purposeLabel")}:</strong> ${escapeHtml(r.purpose)}</p>` : ""}
    ${r.rejectionReason ? `<div class="error-box show">${t("disposal.rejectionReasonLabel")}: ${escapeHtml(r.rejectionReason)}</div>` : ""}

    ${r.status === "APPROVED" ? `<div id="qrContainer"></div>` : ""}
    ${checkInsHtml}

    <div class="btn-row">${actionsHtml}</div>
  `;

  if (r.status === "APPROVED") {
    await renderQr(r.id);
  }
}

// Sinh QR o phia client (thu vien tai qua CDN, giong cach da tai
// html5-qrcode) — chi encode 1 chuoi lay tu backend, khong tu bay dat
// dinh dang QR o frontend.
async function renderQr(id) {
  const res = await apiFetch(`/guest-registrations/${id}/qr-payload`);
  if (!res.ok) return;
  const container = document.getElementById("qrContainer");
  if (!container) return;

  container.innerHTML = `
    <div class="qr-box">
      <div id="qrCanvas" style="display:inline-block;"></div>
      <div class="qr-hint">${t("guest.qrHint")}</div>
    </div>`;

  // Thu vien davidshimjs/qrcodejs — render vao 1 <div> (tu dung canvas/
  // table con ben trong), KHONG dung API .toCanvas(canvas, text, cb) cua
  // thu vien "qrcode" (soldair) — 2 thu vien TEN GIONG NHAU nhung KHAC
  // HOAN TOAN nhau, da nham lan luc dau, da xac minh lai truoc khi giao.
  new QRCode(document.getElementById("qrCanvas"), {
    text: res.data.qrPayload,
    width: 220,
    height: 220,
  });
}

async function doSubmit(event) {
  hideError("detailError");
  const btn = event.target;
  btn.disabled = true;
  const res = await apiFetch(`/guest-registrations/${currentDetailId}/submit`, { method: "POST" });
  if (!res.ok) {
    btn.disabled = false;
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  await renderDetail();
  await loadList();
}

async function doCancel(event) {
  if (!confirm(t("guest.cancelConfirm"))) return;
  hideError("detailError");
  const btn = event.target;
  btn.disabled = true;
  const res = await apiFetch(`/guest-registrations/${currentDetailId}/cancel`, { method: "POST" });
  if (!res.ok) {
    btn.disabled = false;
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  await renderDetail();
  await loadList();
}

async function doApproveManager(event) {
  hideError("detailError");
  const btn = event.target;
  btn.disabled = true;
  const res = await apiFetch(`/guest-registrations/${currentDetailId}/approve-manager`, { method: "POST" });
  if (!res.ok) {
    btn.disabled = false;
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  showSuccess("detailSuccess", t("guest.approvedSuccess"));
  await renderDetail();
  await loadList();
}

async function doApproveBod(event) {
  hideError("detailError");
  const btn = event.target;
  btn.disabled = true;
  const res = await apiFetch(`/guest-registrations/${currentDetailId}/approve-bod`, { method: "POST" });
  if (!res.ok) {
    btn.disabled = false;
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  showSuccess("detailSuccess", t("guest.approvedSuccess"));
  await renderDetail();
  await loadList();
}

async function doReject(event) {
  const reason = prompt(t("disposal.rejectReasonPrompt"));
  if (!reason) return;
  hideError("detailError");
  const btn = event.target;
  btn.disabled = true;
  const res = await apiFetch(`/guest-registrations/${currentDetailId}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
  if (!res.ok) {
    btn.disabled = false;
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  await renderDetail();
  await loadList();
}

async function doDelete(event) {
  if (!confirm(t("guest.deleteConfirm"))) return;
  hideError("detailError");
  const btn = event.target;
  btn.disabled = true;
  const res = await apiFetch(`/guest-registrations/${currentDetailId}`, { method: "DELETE" });
  if (!res.ok) {
    btn.disabled = false;
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  closeDetail();
  await loadList();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
