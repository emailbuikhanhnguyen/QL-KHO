requireAuth();

(async function init() {
  await loadI18n();
  renderTopbar("myapprovals");
  applyTranslations();
  await loadList();
})();

// Nhan hien thi cho tung module — dung lai dung cac key nav.* da co san,
// khong tao them ban dich trung lap cho cung 1 ten module.
const MODULE_LABEL_KEY = {
  leave: "nav.leave",
  overtime: "nav.overtime",
  gatepass: "nav.gatepass",
  vehicle: "nav.vehicle",
  "purchase-requisition": "nav.purchase-requisition",
  pricedpr: "nav.pricedpr",
  edoc: "nav.edoc",
  guest: "nav.guest",
};

const MODULE_ICON = {
  leave: "🏖️",
  overtime: "⏰",
  gatepass: "🚪",
  vehicle: "🚗",
  "purchase-requisition": "🛒",
  pricedpr: "💵",
  edoc: "📄",
  guest: "🪪",
};

async function loadList() {
  const container = document.getElementById("listContainer");
  const res = await apiFetch("/my-approvals");

  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }

  const items = res.data;
  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state">✅ ${t("myapprovals.emptyState")}</div>`;
    return;
  }

  // Gom theo module de nguoi duyet de hinh dung "dang con bao nhieu viec o
  // moi loai", thay vi 1 danh sach dai lan lon tat ca.
  const groups = {};
  for (const item of items) {
    if (!groups[item.module]) groups[item.module] = [];
    groups[item.module].push(item);
  }

  container.innerHTML = Object.entries(groups)
    .map(([moduleKey, rows]) => {
      const icon = MODULE_ICON[moduleKey] || "📄";
      const label = t(MODULE_LABEL_KEY[moduleKey] || moduleKey);
      const rowsHtml = rows.map(renderRow).join("");
      return `
        <div class="approval-group">
          <h3 class="approval-group-title">
            ${icon} ${label}
            <span class="approval-count-pill">${rows.length}</span>
          </h3>
          ${rowsHtml}
        </div>`;
    })
    .join("");
}

function renderRow(item) {
  // Ho so dien tu co N cap DONG (level/totalLevels) — uu tien hien "Cap
  // X/Y" thay vi nhan MANAGER/FINAL co dinh (chi dung cho 6 module kia).
  const stageLabel =
    item.level && item.totalLevels
      ? `${t("myapprovals.stageLevelPrefix")} ${item.level}/${item.totalLevels}`
      : item.stage === "MANAGER"
        ? t("myapprovals.stageManager")
        : t("myapprovals.stageFinal");
  const waited = waitingDays(item.submittedAt);
  // Cho tu 3 ngay tro len thi to do — de khong ai bi bo quen qua lau.
  const waitedClass = waited >= 3 ? "waiting-long" : "";
  const waitedText =
    waited === null
      ? "—"
      : waited === 0
        ? t("myapprovals.waitedToday")
        : `${t("myapprovals.waitedPrefix")} ${waited} ${t("myapprovals.waitedDays")}`;

  return `
    <div class="approval-row" onclick="goToItem('${item.href}', ${item.id})">
      <div class="approval-main">
        <div class="approval-code">${item.code}</div>
        <div class="approval-title">${escapeHtml(item.title || "")}</div>
      </div>
      <div class="approval-meta">
        <div>${stageLabel}${item.departmentName ? " · " + escapeHtml(item.departmentName) : ""}</div>
        <div class="${waitedClass}">${waitedText}</div>
      </div>
    </div>`;
}

// Bam vao 1 dong -> sang dung trang cua module do va mo san phieu tuong ung.
// Cac trang module deu doc tham so ?open=<id> de tu mo chi tiet (xem ghi chu
// them o cuoi file nay).
function goToItem(href, id) {
  window.location.href = `${href}?open=${id}`;
}

function waitingDays(submittedAt) {
  if (!submittedAt) return null;
  const ms = Date.now() - new Date(submittedAt).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
