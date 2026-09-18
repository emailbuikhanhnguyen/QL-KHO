requireAuth();

let currentDetailId = null;
let visitorLineCounter = 0;

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
          <td>${escapeHtml(r.companyName)}</td>
          <td>${r.visitors ? r.visitors.length : "—"}</td>
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
        <th>${t("guest.companyNameLabel")}</th>
        <th>${t("guest.visitorCountLabel")}</th>
        <th>${t("guest.dateRangeLabel")}</th>
        <th>${t("common.department")}</th>
        <th>${t("common.status")}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// -------------------------------------------------------------------------
// TAO MOI — danh sach nguoi vao cong THEM/XOA DUOC, toi da 10 nguoi/phieu
// (khop dung mau giay that SECI-CSR-ARFSOP008-2), tai dung dung pattern
// da co o Mua hang (nhieu dong vat tu trong 1 phieu).
// -------------------------------------------------------------------------
const MAX_VISITORS = 10;

function toggleCreateForm() {
  const card = document.getElementById("createCard");
  const isHidden = card.style.display === "none";
  card.style.display = isHidden ? "block" : "none";
  document.getElementById("detailCard").style.display = "none";
  hideError("createError");

  if (isHidden) {
    // Moi mo form: bat dau voi dung 1 dong trong, tranh nguoi dung phai
    // tu bam "+ Them nguoi" ngay tu dau khi chi co 1 khach.
    document.getElementById("visitorsContainer").innerHTML = "";
    addVisitorLine();
  }
}

function addVisitorLine() {
  const container = document.getElementById("visitorsContainer");
  if (container.children.length >= MAX_VISITORS) {
    showError("createError", t("guest.maxVisitorsReached"));
    return;
  }
  visitorLineCounter++;
  const id = visitorLineCounter;
  const row = document.createElement("div");
  row.className = "line-row";
  row.id = `visitor-line-${id}`;
  row.innerHTML = `
    <input type="text" placeholder="${t("guest.visitorNameLabel")}" class="line-fullName" />
    <input type="text" placeholder="${t("guest.idNumberLabel")}" class="line-idNumber" />
    <input type="text" placeholder="${t("guest.visitorNotePlaceholder")}" class="line-note" />
    <button type="button" class="remove-line-btn" onclick="removeVisitorLine(${id})" title="${t("guest.removeVisitorBtn")}">✕</button>
  `;
  container.appendChild(row);
}

function removeVisitorLine(id) {
  const row = document.getElementById(`visitor-line-${id}`);
  if (row) row.remove();
}

function collectVisitors() {
  return Array.from(document.querySelectorAll("#visitorsContainer .line-row"))
    .map((row) => ({
      fullName: row.querySelector(".line-fullName").value.trim(),
      idNumber: row.querySelector(".line-idNumber").value.trim(),
      note: row.querySelector(".line-note").value.trim() || undefined,
    }))
    .filter((v) => v.fullName && v.idNumber);
}

async function submitCreateForm() {
  hideError("createError");
  const companyName = document.getElementById("f_companyName").value.trim();
  const contactPersonName = document.getElementById("f_contactPersonName").value.trim();
  const contactPersonPhone = document.getElementById("f_contactPersonPhone").value.trim();
  const purpose = document.getElementById("f_purpose").value.trim();
  const startDate = document.getElementById("f_startDate").value;
  const endDate = document.getElementById("f_endDate").value;
  const visitors = collectVisitors();

  if (!companyName || !purpose || !startDate || !endDate || visitors.length === 0) {
    showError("createError", t("guest.fillAllFields"));
    return;
  }

  const btn = document.querySelector('#createCard button[onclick="submitCreateForm()"]');
  btn.disabled = true;

  const res = await apiFetch("/guest-registrations", {
    method: "POST",
    body: JSON.stringify({
      companyName,
      contactPersonName: contactPersonName || undefined,
      contactPersonPhone: contactPersonPhone || undefined,
      purpose,
      startDate,
      endDate,
      visitors,
    }),
  });

  btn.disabled = false;

  if (!res.ok) {
    showError("createError", extractErrorMessage(res.data));
    return;
  }

  toggleCreateForm();
  ["f_companyName", "f_contactPersonName", "f_contactPersonPhone", "f_purpose", "f_startDate", "f_endDate"].forEach(
    (id) => (document.getElementById(id).value = ""),
  );
  document.getElementById("visitorsContainer").innerHTML = "";
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

  const visitorsHtml = (r.visitors || [])
    .map(
      (v) => `
      <div class="line-item">
        <strong>${escapeHtml(v.fullName)}</strong> — ${escapeHtml(v.idNumber)}${v.note ? " · " + escapeHtml(v.note) : ""}
      </div>`,
    )
    .join("");

  const checkInsHtml =
    r.checkIns && r.checkIns.length
      ? `<label style="font-weight:600; display:block; margin:16px 0 4px;">${t("guest.checkInHistoryLabel")}</label>` +
        r.checkIns
          .map((c) => `<div class="line-item">${formatDateTime(c.checkedInAt)} — ${escapeHtml(c.checkedInByName || "#" + c.checkedInBy)}${c.notes ? " · " + escapeHtml(c.notes) : ""}</div>`)
          .join("")
      : "";

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="label">${t("guest.companyNameLabel")}</div><div class="value" style="font-weight:400;">${escapeHtml(r.companyName)}</div></div>
      ${r.contactPersonName ? `<div class="detail-field"><div class="label">${t("guest.contactPersonNameLabel")}</div><div class="value" style="font-weight:400;">${escapeHtml(r.contactPersonName)}</div></div>` : ""}
      ${r.contactPersonPhone ? `<div class="detail-field"><div class="label">${t("guest.contactPersonPhoneLabel")}</div><div class="value" style="font-weight:400;">${escapeHtml(r.contactPersonPhone)}</div></div>` : ""}
      <div class="detail-field"><div class="label">${t("guest.dateRangeLabel")}</div><div class="value">${formatDate(r.startDate)} → ${formatDate(r.endDate)}</div></div>
      <div class="detail-field"><div class="label">${t("common.department")}</div><div class="value">${r.department ? escapeHtml(r.department.name) : "—"}</div></div>
    </div>
    <p><strong>${t("guest.purposeLabel")}:</strong> ${escapeHtml(r.purpose)}</p>
    ${r.rejectionReason ? `<div class="error-box show">${t("disposal.rejectionReasonLabel")}: ${escapeHtml(r.rejectionReason)}</div>` : ""}

    <label style="font-weight:600; display:block; margin:16px 0 4px;">${t("guest.visitorListLabel")} (${r.visitors ? r.visitors.length : 0})</label>
    ${visitorsHtml}

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
