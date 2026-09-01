requireAuth();
renderTopbar("qc");

let lotsCache = [];
let itemsCache = [];

(async function init() {
  await loadDropdownData();
  await loadList();
})();

async function loadDropdownData() {
  const [lotsRes, itemsRes] = await Promise.all([
    apiFetch("/lots?limit=100"),
    apiFetch("/items?limit=100"),
  ]);
  lotsCache = lotsRes.ok ? lotsRes.data.data : [];
  itemsCache = itemsRes.ok ? itemsRes.data.data : [];

  const eligibleLots = lotsCache.filter((l) => l.qcStatus === "PENDING" || l.qcStatus === "IN_PROGRESS");
  const lotSelect = document.getElementById("f_lotId");
  if (eligibleLots.length === 0) {
    lotSelect.innerHTML = `<option value="">— Không có lô nào cần kiểm —</option>`;
  } else {
    lotSelect.innerHTML = eligibleLots
      .map((l) => {
        const item = itemsCache.find((i) => i.id === l.itemId);
        return `<option value="${l.id}">${l.lotCode} — ${item ? item.name : "#" + l.itemId} (${l.qcStatus})</option>`;
      })
      .join("");
  }
}

function itemNameForLot(lotId) {
  const lot = lotsCache.find((l) => l.id === lotId);
  if (!lot) return `Lot #${lotId}`;
  const item = itemsCache.find((i) => i.id === lot.itemId);
  return `${lot.lotCode} — ${item ? item.name : "#" + lot.itemId}`;
}

// -------------------------------------------------------------------------
// DANH SACH
// -------------------------------------------------------------------------
async function loadList() {
  const res = await apiFetch("/qc-inspections?limit=50");
  const container = document.getElementById("listContainer");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const inspections = res.data.data;
  if (inspections.length === 0) {
    container.innerHTML = `<div class="empty-state">Chưa có phiếu QC nào.</div>`;
    return;
  }

  const rows = inspections
    .map(
      (q) => `
      <tr class="clickable" onclick="openDetail(${q.id})">
        <td>#${q.id}</td>
        <td>${itemNameForLot(q.lotId)}</td>
        <td>${q.result ? statusBadge(q.result) : "—"}</td>
        <td>${q.images.length} ảnh</td>
        <td>${statusBadge(q.status)}</td>
        <td>${formatDateTime(q.createdAt)}</td>
      </tr>`
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr><th>ID</th><th>Lô hàng</th><th>Kết quả</th><th>Ảnh</th><th>Trạng thái</th><th>Ngày tạo</th></tr></thead>
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
}

async function submitCreateForm() {
  hideError("createError");
  const lotId = Number(document.getElementById("f_lotId").value);
  if (!lotId) {
    showError("createError", "Vui lòng chọn lô hàng.");
    return;
  }
  const result = document.getElementById("f_result").value || undefined;
  const notes = document.getElementById("f_notes").value.trim() || undefined;

  const btn = document.getElementById("createSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Đang tạo...";

  const res = await apiFetch("/qc-inspections", {
    method: "POST",
    body: JSON.stringify({ lotId, result, notes }),
  });

  btn.disabled = false;
  btn.textContent = "Tạo phiếu (DRAFT)";

  if (!res.ok) {
    showError("createError", extractErrorMessage(res.data));
    return;
  }

  toggleCreateForm();
  await loadDropdownData(); // lot vua tao phieu co the doi qcStatus -> IN_PROGRESS
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
  document.getElementById("detailId").textContent = id;
  hideError("detailError");
  await renderDetail();
  document.getElementById("detailCard").scrollIntoView({ behavior: "smooth" });
}

function closeDetail() {
  document.getElementById("detailCard").style.display = "none";
  currentDetailId = null;
}

async function renderDetail() {
  const res = await apiFetch(`/qc-inspections/${currentDetailId}`);
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  const q = res.data;

  let actionsHtml = "";
  if (q.status === "DRAFT") {
    actionsHtml = `
      <button class="btn btn-primary" onclick="doAction('submit')">Gửi duyệt</button>
      <button class="btn btn-danger" onclick="doDelete()">Xóa phiếu</button>`;
  } else if (q.status === "PENDING_APPROVAL") {
    actionsHtml = `
      <button class="btn btn-success" onclick="doAction('approve')">✔ Duyệt</button>
      <button class="btn btn-danger" onclick="doReject()">✕ Từ chối</button>`;
  } else if (q.status === "REJECTED") {
    actionsHtml = `<button class="btn btn-secondary" onclick="doAction('reopen')">Mở lại để sửa</button>`;
  }

  const uploadHtml =
    q.status === "DRAFT"
      ? `
      <div class="form-row" style="margin-top: 12px;">
        <label>Thêm ảnh chụp phiếu kiểm hàng</label>
        <input type="file" id="imageFileInput" accept="image/jpeg,image/png,image/webp" onchange="handleImageUpload()" />
      </div>`
      : "";

  document.getElementById("detailContainer").innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="label">Lô hàng</div><div class="value">${itemNameForLot(q.lotId)}</div></div>
      <div class="detail-field"><div class="label">Kết quả</div><div class="value">${q.result ? statusBadge(q.result) : "Chưa chọn"}</div></div>
      <div class="detail-field"><div class="label">Trạng thái</div><div class="value">${statusBadge(q.status)}</div></div>
      <div class="detail-field"><div class="label">Ngày tạo</div><div class="value">${formatDateTime(q.createdAt)}</div></div>
    </div>
    ${q.notes ? `<p><strong>Ghi chú:</strong> ${q.notes}</p>` : ""}
    ${q.rejectedReason ? `<div class="error-box show">Lý do từ chối: ${q.rejectedReason}</div>` : ""}

    <h3>Ảnh đính kèm (${q.images.length})</h3>
    <div id="imagesContainer">Đang tải ảnh...</div>
    ${uploadHtml}

    <div class="btn-row">${actionsHtml}</div>
  `;

  await renderImages(q.images, q.status === "DRAFT");
}

async function renderImages(images, canDelete) {
  const container = document.getElementById("imagesContainer");
  if (images.length === 0) {
    container.innerHTML = `<p style="color: var(--muted); font-size: 13px;">Chưa có ảnh nào.</p>`;
    return;
  }

  container.innerHTML = images
    .map((img) => `<span class="image-thumb" id="thumb_${img.id}">Đang tải...</span>`)
    .join("");

  for (const img of images) {
    const url = await apiFetchImageUrl(`/qc-inspections/images/${img.id}/file`);
    const thumb = document.getElementById(`thumb_${img.id}`);
    if (!thumb) continue;
    const deleteBtn = canDelete
      ? `<button onclick="deleteImage(${img.id})" style="position:absolute; top:2px; right:2px; background:rgba(200,0,0,0.85); color:#fff; border:none; border-radius:4px; width:20px; height:20px; cursor:pointer; font-size:11px;">✕</button>`
      : "";
    thumb.innerHTML = url
      ? `<img src="${url}" alt="anh QC" />${deleteBtn}`
      : `<span style="font-size:11px; color: var(--danger);">Lỗi tải ảnh</span>`;
  }
}

async function handleImageUpload() {
  const input = document.getElementById("imageFileInput");
  const file = input.files[0];
  if (!file) return;

  const res = await apiUpload(`/qc-inspections/${currentDetailId}/images`, file);
  input.value = "";

  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  showSuccess("detailSuccess", "Đã thêm ảnh.");
  await renderDetail();
  await loadList();
}

async function deleteImage(imageId) {
  if (!confirm("Xóa ảnh này?")) return;
  const res = await apiFetch(`/qc-inspections/images/${imageId}`, { method: "DELETE" });
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  await renderDetail();
  await loadList();
}

async function doAction(action) {
  hideError("detailError");
  const res = await apiFetch(`/qc-inspections/${currentDetailId}/${action}`, { method: "POST" });
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  showSuccess("detailSuccess", "Thao tác thành công.");
  await loadDropdownData();
  await renderDetail();
  await loadList();
}

async function doReject() {
  const reason = prompt("Nhập lý do từ chối:");
  if (!reason) return;
  hideError("detailError");
  const res = await apiFetch(`/qc-inspections/${currentDetailId}/reject`, {
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
  if (!confirm("Xóa phiếu QC này? Không thể hoàn tác.")) return;
  const res = await apiFetch(`/qc-inspections/${currentDetailId}`, { method: "DELETE" });
  if (!res.ok) {
    showError("detailError", extractErrorMessage(res.data));
    return;
  }
  closeDetail();
  await loadList();
}
