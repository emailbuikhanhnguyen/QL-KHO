// ============================================================================
// i18n.js — co che da ngon ngu dung chung cho toan bo giao dien web.
// Ho tro: Tieng Viet (vi, mac dinh), English (en), 中文 (zh).
// Luu lua chon ngon ngu vao localStorage — ai cung tu bam doi duoc, khong
// gan theo tai khoan (dung yeu cau: "nut chuyen doi o moi trang").
// ============================================================================

const LANG_STORAGE_KEY = "kho_npl_lang";
const SUPPORTED_LANGS = ["vi", "en", "zh"];
const DEFAULT_LANG = "vi";

let currentDictionary = null;

function getCurrentLang() {
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  return SUPPORTED_LANGS.includes(saved) ? saved : DEFAULT_LANG;
}

function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  // Tai lai trang de ap dung ngon ngu moi cho toan bo noi dung (don gian,
  // it loi hon so voi co gang re-render moi thanh phan dong tai cho).
  window.location.reload();
}

// Tai tu dien ngon ngu hien tai. Goi 1 lan luc dau trang, cho await xong
// moi render UI de tranh hien "nhap nhay" chu chua dich.
async function loadI18n() {
  const lang = getCurrentLang();
  try {
    const res = await fetch(`/i18n/${lang}.json`);
    currentDictionary = await res.json();
  } catch (e) {
    console.error("Khong tai duoc tu dien ngon ngu:", e);
    currentDictionary = {};
  }
  document.documentElement.lang = lang;
}

// Tra cuu 1 khoa dich, vi du t("goodsReceipt.title"). Neu khong tim thay,
// tra ve chinh khoa do (de de nhan ra thieu ban dich thay vi man hinh trang).
function t(key) {
  if (!currentDictionary) return key;
  const parts = key.split(".");
  let node = currentDictionary;
  for (const p of parts) {
    if (node && typeof node === "object" && p in node) {
      node = node[p];
    } else {
      return key;
    }
  }
  return typeof node === "string" ? node : key;
}

// Dich rieng cho cac gia tri enum trang thai (DRAFT, PENDING_APPROVAL...) —
// dung o moi noi hien thi badge trang thai.
function tStatus(statusCode) {
  if (!currentDictionary || !currentDictionary.status) return statusCode;
  return currentDictionary.status[statusCode] || statusCode;
}

// Quet toan bo DOM, tim phan tu co thuoc tinh data-i18n="key" va dien noi
// dung da dich vao. Rieng data-i18n-placeholder de dich placeholder cua
// input, data-i18n-attr="title" de dich thuoc tinh tuy chon.
function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.setAttribute("placeholder", t(key));
  });
}

// Nut chuyen doi ngon ngu — 3 nut nho VI / EN / 中文, dat vao topbar.
function renderLanguageSwitcher() {
  const current = getCurrentLang();
  const labels = { vi: "VI", en: "EN", zh: "中文" };
  const buttonsHtml = SUPPORTED_LANGS.map((lang) => {
    const active = lang === current ? "active" : "";
    return `<button class="lang-btn ${active}" onclick="setLang('${lang}')">${labels[lang]}</button>`;
  }).join("");
  return `<div class="lang-switcher">${buttonsHtml}</div>`;
}
