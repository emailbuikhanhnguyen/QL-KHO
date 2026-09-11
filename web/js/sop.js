requireAuth();

// Trang "Quy trinh su dung SEC ERP" — KHAC trang Tro giup o cho:
//   - Tro giup: to chuc theo TUNG MODULE ("nut nay dung the nao")
//   - Trang nay: to chuc theo VAI TRO ("ban lam cong viec gi, theo thu tu
//     nao") — de nguoi moi vao doc 1 lan la biet duong lam viec, khong
//     phai doc rai rac 26 muc cua Tro giup.
//
// Noi dung co dinh trong i18n (nguoi dung KHONG sua/tai xuong duoc), chi
// cap nhat khi cac module trong app thay doi.
const SOP_ORDER = [
  "employee",
  "deptHead",
  "warehouse",
  "qc",
  "hr",
  "purchaser",
  "accountant",
  "bod",
];

(async function init() {
  await loadI18n();
  renderTopbar("sop");
  applyTranslations();
  renderSopPage();
  handleDeepLink();
})();

function renderSopPage() {
  const sections = tRaw("sop.sections");
  if (!sections) {
    document.getElementById("sopContent").innerHTML = "Không tải được nội dung.";
    return;
  }

  document.getElementById("sopToc").innerHTML = SOP_ORDER.map((key) => {
    const sec = sections[key];
    return sec ? `<a href="#${key}" data-section="${key}">${escapeHtml(sec.title)}</a>` : "";
  }).join("");

  document.getElementById("sopContent").innerHTML = SOP_ORDER.map((key) => {
    const sec = sections[key];
    return sec ? renderSection(key, sec) : "";
  }).join("");

  document.querySelectorAll(".help-toc a").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const key = link.getAttribute("data-section");
      document.getElementById("section-" + key).scrollIntoView({ behavior: "smooth" });
      setActiveTocLink(key);
      history.replaceState(null, "", "#" + key);
    });
  });
}

function renderSection(key, sec) {
  let body = "";

  if (sec.intro) {
    body += `<p style="color: var(--muted); margin: 0 0 12px;">${escapeHtml(sec.intro)}</p>`;
  }

  // Cac buoc lam viec theo thu tu — phan chinh cua moi vai tro.
  if (Array.isArray(sec.steps)) {
    body += `<ol>${sec.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>`;
  }

  // Luu y rieng cua vai tro do (neu co) — VD: quy tac khong duoc tu duyet
  // don cua chinh minh.
  if (Array.isArray(sec.notes) && sec.notes.length) {
    body += `
      <div class="sop-note">
        <strong>${escapeHtml(sec.notesLabel || "Lưu ý")}</strong>
        <ul style="margin: 6px 0 0; padding-left: 20px; line-height: 1.7;">
          ${sec.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}
        </ul>
      </div>`;
  }

  return `
    <div class="card help-section" id="section-${key}">
      <h2>${escapeHtml(sec.title)}</h2>
      ${body}
    </div>`;
}

function setActiveTocLink(key) {
  document.querySelectorAll(".help-toc a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("data-section") === key);
  });
}

// Ho tro mo thang toi 1 vai tro cu the qua duong dan dang /sop.html#deptHead
function handleDeepLink() {
  const hash = window.location.hash.replace("#", "");
  if (!hash) return;
  const el = document.getElementById("section-" + hash);
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
    setActiveTocLink(hash);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
