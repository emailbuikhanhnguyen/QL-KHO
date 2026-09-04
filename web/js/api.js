// ============================================================================
// api.js — helper dung chung cho toan bo giao dien demo.
// Luu token vao localStorage (day la webpage that chay tren trinh duyet
// that cua nguoi dung, khong phai artifact/preview cua Claude, nen dung
// localStorage binh thuong nhu moi web app khac la an toan).
// ============================================================================

const API_BASE = "/api";
const TOKEN_KEY = "kho_npl_token";
const USER_KEY = "kho_npl_user";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getCurrentUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = "/index.html";
  }
}

function logout() {
  clearSession();
  window.location.href = "/index.html";
}

// Goi API, tu dong gan Bearer token, tu dong chuyen huong ve login neu 401.
// Tra ve { ok, status, data } — khong throw, de UI tu quyet dinh hien loi.
async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  headers["Content-Type"] = headers["Content-Type"] || "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Gui kem ngon ngu dang chon de backend tra ve thong bao loi dung ngon
  // ngu (xem src/common/filters/i18n-exception.filter.ts).
  headers["Accept-Language"] = typeof getCurrentLang === "function" ? getCurrentLang() : "vi";

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (networkErr) {
    return { ok: false, status: 0, data: { message: "Khong ket noi duoc toi server. Kiem tra app da chay chua." } };
  }

  if (response.status === 401) {
    clearSession();
    window.location.href = "/index.html";
    return { ok: false, status: 401, data: { message: "Phien dang nhap het han." } };
  }

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  return { ok: response.ok, status: response.status, data };
}

async function apiUpload(path, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

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

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

// Tai file anh co gan Bearer token, tra ve blob URL de gan vao <img src>.
// Can lam rieng vi the <img> thuong khong tu gui kem header Authorization.
async function apiFetchImageUrl(path) {
  const token = getToken();
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (e) {
    return null;
  }
}

// Tai file bat ky (Excel, PDF...) co gan Bearer token, kich hoat "Save As"
// cua trinh duyet. Dung cho cac nut "Xuat Excel".
async function apiDownloadFile(path, suggestedFilename) {
  const token = getToken();
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept-Language": typeof getCurrentLang === "function" ? getCurrentLang() : "vi",
      },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      return { ok: false, data };
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedFilename || "bao-cao.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, data: { message: "Khong ket noi duoc toi server." } };
  }
}

function showError(elId, message) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
}

function hideError(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.classList.remove("show");
}

function showSuccess(elId, message) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 4000);
}

function extractErrorMessage(data) {
  if (!data) return "Da xay ra loi khong xac dinh.";
  if (Array.isArray(data.message)) return data.message.join("; ");
  return data.message || "Da xay ra loi khong xac dinh.";
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN");
}

function formatNumber(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 3 });
}

// Mau badge theo trang thai — dung chung cho ca 3 module
const STATUS_BADGE_MAP = {
  DRAFT: "badge-gray",
  PENDING_APPROVAL: "badge-warning",
  PENDING_HEAD_APPROVAL: "badge-warning",
  PENDING_BOD_APPROVAL: "badge-warning",
  APPROVED: "badge-info",
  CONFIRMED: "badge-success",
  ISSUED: "badge-success",
  PASSED: "badge-success",
  FAILED: "badge-danger",
  PARTIALLY_PASSED: "badge-warning",
  PENDING: "badge-gray",
  IN_PROGRESS: "badge-warning",
  PENDING_DISPOSITION: "badge-warning",
  REJECTED: "badge-danger",
};

function statusBadge(status) {
  const cls = STATUS_BADGE_MAP[status] || "badge-gray";
  // Fallback an toan neu i18n.js chua duoc tai (trang chua chuyen doi xong)
  const label = typeof tStatus === "function" ? tStatus(status) : status;
  return `<span class="badge ${cls}">${label}</span>`;
}

function renderTopbar(activePage) {
  const user = getCurrentUser();
  const el = document.getElementById("topbar");
  if (!el) return;
  // Fallback an toan: neu trang nao do (dang chuyen doi dan) chua kip tai
  // i18n.js, KHONG duoc de crash ca trang — dung tam nhan tieng Viet mac dinh.
  const safeT = typeof t === "function" ? t : (key, fallback) => fallback || key;
  const safeLangSwitcher = typeof renderLanguageSwitcher === "function" ? renderLanguageSwitcher() : "";

  const links = [
    { href: "/dashboard.html", key: "dashboard", labelKey: "nav.dashboard", fallback: "Trang chủ" },
    { href: "/goods-receipts.html", key: "goods-receipts", labelKey: "nav.goodsReceipt", fallback: "Nhập kho" },
    { href: "/qc-inspections.html", key: "qc", labelKey: "nav.qc", fallback: "QC" },
    { href: "/issue-requests.html", key: "issue", labelKey: "nav.issue", fallback: "Xuất kho" },
    { href: "/warehouse-transfers.html", key: "transfer", labelKey: "nav.transfer", fallback: "Điều chuyển" },
    { href: "/reports.html", key: "reports", labelKey: "nav.reports", fallback: "Báo cáo" },
    { href: "/stocktake.html", key: "stocktake", labelKey: "nav.stocktake", fallback: "Kiểm kê" },
    { href: "/stocktake-scan.html", key: "stocktake-scan", labelKey: "nav.qrScan", fallback: "Quét QR" },
    { href: "/disposal-requests.html", key: "disposal", labelKey: "nav.disposal", fallback: "Xử lý hàng lỗi" },
  ];
  const navHtml = links
    .map(
      (l) =>
        `<a href="${l.href}" class="${l.key === activePage ? "active" : ""}">${safeT(l.labelKey, l.fallback)}</a>`
    )
    .join("");

  el.innerHTML = `
    <div class="brand">Kho NPL</div>
    <nav>${navHtml}</nav>
    <div class="user-info">
      <a href="/help.html${getHelpAnchorFor(activePage)}" title="Trợ giúp" style="color:#cfd8f5; font-size:18px; text-decoration:none;">❓</a>
      ${safeLangSwitcher}
      <button class="user-name-btn" onclick="showProfileModal()">${user ? user.fullName + " (" + user.role + ")" : ""}</button>
      <button class="logout" onclick="logout()">${safeT("common.logout", "Đăng xuất")}</button>
    </div>
    <div class="modal-overlay" id="profileModalOverlay" style="display:none;" onclick="if(event.target===this) closeProfileModal()">
      <div class="modal-box">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h2>${safeT("profile.modalTitle", "Thông tin của bạn")}</h2>
          <button class="modal-close-btn" onclick="closeProfileModal()">✕</button>
        </div>
        <div id="profileModalBody"></div>
      </div>
    </div>
  `;
}

// Hien modal "Thong tin cua ban" — lay du lieu ngay tu user dang luu trong
// localStorage (khong can goi API them), dich noi dung nhiem vu theo dung
// vai tro cua nguoi dang dang nhap.
function showProfileModal() {
  const user = getCurrentUser();
  if (!user) return;

  const roleLabel = (typeof tRaw === "function" && tRaw(`profile.roleLabels.${user.role}`)) || user.role;
  const duties = (typeof tRaw === "function" && tRaw(`profile.roleDuties.${user.role}`)) || "";
  const safeT2 = typeof t === "function" ? t : (key, fallback) => fallback || key;

  document.getElementById("profileModalBody").innerHTML = `
    <div class="profile-field">
      <div class="label">${safeT2("profile.fullNameLabel", "Họ và tên")}</div>
      <div class="value">${user.fullName}</div>
    </div>
    <div class="profile-field">
      <div class="label">${safeT2("profile.emailLabel", "Email")}</div>
      <div class="value">${user.email}</div>
    </div>
    <div class="profile-field">
      <div class="label">${safeT2("profile.departmentLabel", "Phòng ban")}</div>
      <div class="value">${user.department ? user.department.name : "—"}</div>
    </div>
    <div class="profile-field">
      <div class="label">${safeT2("profile.roleLabel", "Vai trò")}</div>
      <div class="value">${roleLabel} <span style="color:var(--muted); font-weight:400;">(${user.role})</span></div>
    </div>
    <div class="profile-field">
      <div class="label">${safeT2("profile.dutiesTitle", "Nhiệm vụ & Chức năng")}</div>
      <div class="profile-duties-box">${duties}</div>
    </div>
    <a href="/help.html#permissions" style="display:inline-block; margin-top:4px; color:var(--navy); font-weight:600; font-size:13.5px;">
      ${safeT2("profile.viewFullPermissionsLink", "Xem đầy đủ bảng phân quyền →")}
    </a>
  `;
  document.getElementById("profileModalOverlay").style.display = "flex";
}

function closeProfileModal() {
  const el = document.getElementById("profileModalOverlay");
  if (el) el.style.display = "none";
}

// Anh xa "dang o trang nao" -> "phan Tro giup tuong ung" — bam nut ❓ o
// bat ky trang nao cung nhay thang toi dung muc lien quan, khong phai
// luon phai cuon tu dau.
function getHelpAnchorFor(activePage) {
  const map = {
    dashboard: "#gettingStarted",
    "goods-receipts": "#goodsReceipt",
    qc: "#qc",
    issue: "#issueRequest",
    transfer: "#transfer",
    reports: "#reports",
    stocktake: "#stocktakeManagement",
    disposal: "#disposalHelp",
  };
  return map[activePage] ? map[activePage] : "";
}

// -------------------------------------------------------------------------
// Tu dong boc moi <table> trong 1 div co the cuon ngang rieng — tranh
// tinh trang bang nhieu cot (VD: Nhap kho co 6 cot) lam tran ca trang tren
// man hinh dien thoai. Quan trong vi Kiem ke thuong dung dien thoai.
//
// Dung MutationObserver de tu dong ap dung cho CA table duoc render dong
// bang JS sau khi tai trang (hau het cac trang deu fetch du lieu roi moi
// ve bang, khong phai table co san tu dau) — khong can goi tay o tung noi,
// va tu dong hoat dong voi ca trang/module them sau nay.
// -------------------------------------------------------------------------
function wrapTableForMobileScroll(table) {
  if (table.parentElement && table.parentElement.classList.contains("table-scroll-wrapper")) return;
  const wrapper = document.createElement("div");
  wrapper.className = "table-scroll-wrapper";
  table.parentNode.insertBefore(wrapper, table);
  wrapper.appendChild(table);
}

function initTableScrollWrapping() {
  document.querySelectorAll("table").forEach(wrapTableForMobileScroll);
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return; // chi xu ly element node
        if (node.tagName === "TABLE") wrapTableForMobileScroll(node);
        if (node.querySelectorAll) node.querySelectorAll("table").forEach(wrapTableForMobileScroll);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// Script nay nam cuoi body (sau khi DOM da dung), nen goi ngay khong can
// doi DOMContentLoaded.
initTableScrollWrapping();
