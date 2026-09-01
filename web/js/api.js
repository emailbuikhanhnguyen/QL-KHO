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
  // Hien nhan da dich (tStatus tu i18n.js) thay vi ma enum tho — mau sac
  // badge van dua theo dung ma goc, chi phan chu hien thi la duoc dich.
  const label = typeof tStatus === "function" ? tStatus(status) : status;
  return `<span class="badge ${cls}">${label}</span>`;
}

function renderTopbar(activePage) {
  const user = getCurrentUser();
  const el = document.getElementById("topbar");
  if (!el) return;
  const links = [
    { href: "/dashboard.html", key: "dashboard", labelKey: "nav.dashboard" },
    { href: "/goods-receipts.html", key: "goods-receipts", labelKey: "nav.goodsReceipt" },
    { href: "/qc-inspections.html", key: "qc", labelKey: "nav.qc" },
    { href: "/issue-requests.html", key: "issue", labelKey: "nav.issue" },
    { href: "/warehouse-transfers.html", key: "transfer", labelKey: "nav.transfer" },
    { href: "/reports.html", key: "reports", labelKey: "nav.reports" },
  ];
  const navHtml = links
    .map(
      (l) =>
        `<a href="${l.href}" class="${l.key === activePage ? "active" : ""}">${t(l.labelKey)}</a>`
    )
    .join("");

  el.innerHTML = `
    <div class="brand">Kho NPL</div>
    <nav>${navHtml}</nav>
    <div class="user-info">
      ${renderLanguageSwitcher()}
      <span>${user ? user.fullName + " (" + user.role + ")" : ""}</span>
      <button class="logout" onclick="logout()">${t("common.logout")}</button>
    </div>
  `;
}
