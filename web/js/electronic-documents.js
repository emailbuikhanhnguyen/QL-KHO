requireAuth();

let currentDetailId = null;

(async function init() {
  await loadI18n();
  renderTopbar("edoc");
  applyTranslations();
  await loadCategorySuggestions();
  await loadList();
})();

// Ham upload rieng cho trang nay — apiUpload() co san trong api.js chi
// gui dung 1 field "file", con o day can gui KEM CA title/category trong
// CUNG 1 request multipart (backend doc @Body() dto CUNG luc voi
// @UploadedFile() file). KHONG sua apiUpload() chung de tranh anh huong
// noi khac dang dung ham do.
async function uploadDocument(path, file, fields) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== "") formData.append(key, value);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept-Language": typeof getCurrentLang === "function" ? getCurrentLang() : "vi",
      },
      body: formData,
    });
  } catch (e) {
    return { ok: false, status: 0, data: { message: "Khong ket noi duoc toi server." } };
  }

  if (response.status === 401) {
    clearSession();
    window.location.href = "/index.html";
    return { ok: false, status: 401, data: null };
  }

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

async function loadCategorySuggestions() {
  const res = await apiFetch("/electronic-documents/category-suggestions");
  if (!res.ok) return;
  document.getElementById("categorySuggestions").innerHTML = res.data.map((c) => `<option value="${escapeHtml(c)}"></option>`).join("");
}

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/electronic-documents?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const items = res.data.data;
  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("edoc.emptyState")}</div>`;
    return;
  }

  const rows = items
    .map(
      (r) => `
        <tr class="clickable" onclick="openDetail(${r.id})">
          <td><strong>${r.code}</strong></td>
          <td>${escapeHtml(r.title)}</td>
          <td>${r.category ? escapeHtml(r.category) : "—"}</td>
          <td>v${r.version}</td>
          <td>${r.department ? escapeHtml(r.department.name) : "#" + r.departmentId}</td>
          <td>${statusBadge(r.status)}</td>
        </tr>`,
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("edoc.tableCode")}</th>
        <th>${t("edoc.titleLabel")}</th>
        <th>${t("edoc.categoryLabel")}</th>
        <th>${t("edoc.versionLabel")}</th>
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
  const title = document.getElementById("f_title").value.trim();
  const category = document.getElementById("f_category").value.trim();
  const fileInput = document.getElementById("f_file");
  const file = fileInput.files[0];

  if (!title || !file) {
    showError("createError", t("edoc.fillAllFields"));
    return;
  }

  const btn = document.querySelector('#createCard button[onclick="submitCreateForm()"]');
  btn.disabled = true;

  const res = await uploadDocument("/electronic-documents", file, { title, category });

  btn.disabled = false;

  if (!res.ok) {
    showError("createError", extractErrorMessage(res.data));
    return;
  }

  toggleCreateForm();
  document.getElementById("f_title").value = "";
  document.getElementById("f_category").value = "";
  fileInput.value = "";
  await loadList();
  openDetail(res.data.id);
}

// -------------------------------------------------------------------------
// CHI TIET — bao gom hien thi CHUOI DUYET N CAP DONG (khac han 6 module
// truoc chi co dung 2 cap co dinh).
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
  const res = await apiFetch(`/electronic-documents/${currentDetailId}`);
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  const r = res.data;
  document.getElementById("detailCode").innerHTML = `${r.code} — ${statusBadge(r.status)}`;

  const user = getCurrentUser();
  const isOwner = user && (user.id === r.uploadedBy || user.role === "ADMIN");

  // Tim buoc dang PENDING co level nho nhat — day chinh la "buoc hien tai".
  const pendingSteps = (r.approvalSteps || []).filter((s) => s.status === "PENDING").sort((a, b) => a.level - b.level);
  const currentStep = pendingSteps[0];
  const isMyTurn = currentStep && user && (user.id === currentStep.approverId || user.role === "ADMIN");

  let actionsHtml = "";
  if (r.status === "DRAFT" && isOwner) {
    actionsHtml = `
      <button class="btn btn-primary" onclick="doSubmit(event)">${t("edoc.submitBtn")}</button>
      <button class="btn btn-danger" onclick="doDelete(event)">${t("common.delete")}</button>`;
  } else if (r.status === "PENDING_APPROVAL" && isOwner) {
    actionsHtml = `<button class="btn btn-danger" onclick="doCancel(event)">${t("edoc.cancelBtn")}</button>`;
  }
  if (r.status === "PENDING_APPROVAL" && isMyTurn) {
    actionsHtml += `
      <button class="btn btn-success" onclick="doApprove(event)">${t("edoc.approveBtn")}</button>
      <button class="btn btn-danger" onclick="doReject(event)">${t("common.reject")}</button>`;
  }
  if (r.status === "APPROVED" && isOwner) {
    actionsHtml += `<button class="btn btn-outline" onclick="openNewVersionPrompt()">${t("edoc.newVersionBtn")}</button>`;
  }

  const chainHtml = (r.approvalSteps || [])
    .map((s) => {
      const cls = s.status === "APPROVED" ? "is-approved" : s.status === "REJECTED" ? "is-rejected" : s.status === "SKIPPED" ? "is-skipped" : "is-pending";
      const statusLabel =
        s.status === "APPROVED" ? t("edoc.stepApproved") : s.status === "REJECTED" ? t("edoc.stepRejected") : s.status === "SKIPPED" ? t("edoc.stepSkipped") : t("edoc.stepPending");
      const timeText = s.actedAt ? formatDateTime(s.actedAt) : "";
      return `
        <div class="approval-chain-step ${cls}">
          <div class="approval-chain-level">${s.level}</div>
          <div class="approval-chain-main">
            <div class="approval-chain-name">${escapeHtml(s.approverName || "#" + s.approverId)}</div>
            <div class="approval-chain-meta">${statusLabel}${timeText ? " · " + timeText : ""}${s.comment ? " · " + escapeHtml(s.comment) : ""}</div>
          </div>
        </div>`;
    })
    .join("");

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="label">${t("edoc.titleLabel")}</div><div class="value" style="font-weight:400;">${escapeHtml(r.title)}</div></div>
      <div class="detail-field"><div class="label">${t("edoc.categoryLabel")}</div><div class="value" style="font-weight:400;">${r.category ? escapeHtml(r.category) : "—"}</div></div>
      <div class="detail-field"><div class="label">${t("edoc.versionLabel")}</div><div class="value">v${r.version}</div></div>
      <div class="detail-field"><div class="label">${t("common.department")}</div><div class="value">${r.department ? escapeHtml(r.department.name) : "—"}</div></div>
      <div class="detail-field"><div class="label">${t("edoc.uploadedByLabel")}</div><div class="value" style="font-weight:400;">${escapeHtml(r.uploadedByName || "#" + r.uploadedBy)}</div></div>
    </div>
    <p><a href="${API_BASE}/electronic-documents/${r.id}/file" target="_blank">${escapeHtml(r.originalFileName)} ↗</a></p>

    ${r.approvalSteps && r.approvalSteps.length > 0 ? `
      <label style="font-weight:600; display:block; margin:16px 0 4px;">${t("edoc.approvalChainLabel")}</label>
      <div class="approval-chain">${chainHtml}</div>
    ` : ""}

    ${r.rejectionReason ? `<div class="error-box show">${t("disposal.rejectionReasonLabel")}: ${escapeHtml(r.rejectionReason)}</div>` : ""}
    <div class="btn-row">${actionsHtml}</div>
  `;
}

async function doSubmit(event) {
  hideError("detailError");
  const btn = event.target;
  btn.disabled = true;
  const res = await apiFetch(`/electronic-documents/${currentDetailId}/submit`, { method: "POST" });
  if (!res.ok) {
    btn.disabled = false; // mo lai nut de thu lai duoc, vi day co the chi la loi mang tam thoi
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  await renderDetail();
  await loadList();
}

async function doCancel(event) {
  if (!confirm(t("edoc.cancelConfirm"))) return;
  hideError("detailError");
  const btn = event.target;
  btn.disabled = true;
  const res = await apiFetch(`/electronic-documents/${currentDetailId}/cancel`, { method: "POST" });
  if (!res.ok) {
    btn.disabled = false;
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  await renderDetail();
  await loadList();
}

// Khoa nut NGAY LUC BAM (truoc khi cho ket qua API ve) — sua loi da phat
// hien 14/09/2026: bam 2 lan lien tiep truoc khi man hinh kip ve lai se
// gui 2 request cho CUNG 1 buoc duyet, request thu 2 bi tu choi dung logic
// (buoc do da duyet xong) nhung trai nghiem nguoi dung thay nhu la loi.
async function doApprove(event) {
  hideError("detailError");
  const btn = event.target;
  btn.disabled = true;
  const res = await apiFetch(`/electronic-documents/${currentDetailId}/approve`, { method: "POST", body: JSON.stringify({}) });
  if (!res.ok) {
    btn.disabled = false;
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  showSuccess("detailSuccess", t("edoc.approvedSuccess"));
  await renderDetail();
  await loadList();
}

async function doReject(event) {
  const reason = prompt(t("disposal.rejectReasonPrompt"));
  if (!reason) return;
  hideError("detailError");
  const btn = event.target;
  btn.disabled = true;
  const res = await apiFetch(`/electronic-documents/${currentDetailId}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
  if (!res.ok) {
    btn.disabled = false;
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  await renderDetail();
  await loadList();
}

async function doDelete(event) {
  if (!confirm(t("edoc.deleteConfirm"))) return;
  hideError("detailError");
  const btn = event.target;
  btn.disabled = true;
  const res = await apiFetch(`/electronic-documents/${currentDetailId}`, { method: "DELETE" });
  if (!res.ok) {
    btn.disabled = false;
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  closeDetail();
  await loadList();
}

async function openNewVersionPrompt() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    hideError("detailError");
    const res = await uploadDocument(`/electronic-documents/${currentDetailId}/new-version`, file, {});
    if (!res.ok) { showError("detailError", extractErrorMessage(res.data)); return; }
    await loadList();
    openDetail(res.data.id);
  };
  input.click();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
