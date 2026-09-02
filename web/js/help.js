requireAuth();

// Thu tu hien thi cac phan — khop voi thu tu cac module tren Dashboard.
const SECTION_ORDER = [
  "gettingStarted",
  "demoAccounts",
  "goodsReceipt",
  "qc",
  "issueRequest",
  "transfer",
  "reports",
  "stocktakeManagement",
  "scan",
  "permissions",
  "faq",
];

(async function init() {
  await loadI18n();
  renderTopbar(null); // khong co muc nao tren topbar tuong ung "Tro giup" duoc highlight rieng
  applyTranslations();
  renderHelpPage();
  handleDeepLink();
})();

function renderHelpPage() {
  const sections = tRaw("help.sections");
  if (!sections) {
    document.getElementById("helpContent").innerHTML = "Không tải được nội dung trợ giúp.";
    return;
  }

  // ---- Muc luc (TOC) ----
  const tocHtml = SECTION_ORDER.map((key) => {
    const sec = sections[key];
    if (!sec) return "";
    return `<a href="#${key}" data-section="${key}">${sec.title}</a>`;
  }).join("");
  document.getElementById("helpToc").innerHTML = tocHtml;

  // ---- Noi dung tung phan ----
  const contentHtml = SECTION_ORDER.map((key) => {
    const sec = sections[key];
    if (!sec) return "";
    return renderSection(key, sec);
  }).join("");
  document.getElementById("helpContent").innerHTML = contentHtml;

  // Cuon muot khi bam vao muc luc + highlight dung muc dang active
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
  // Ghep noi nhieu khoi noi dung lien tiep (khong con la if/else loai tru
  // nhau) — cho phep 1 muc vua co bang vai tro, vua co bang ghi chu rieng
  // tung module (VD: muc "Phan quyen").
  let bodyHtml = "";

  if (Array.isArray(sec.steps)) {
    bodyHtml += `<ol>${sec.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>`;
  }

  if (Array.isArray(sec.roles)) {
    const rows = sec.roles
      .map(([role, desc]) => `<tr><td><code>${escapeHtml(role)}</code></td><td>${escapeHtml(desc)}</td></tr>`)
      .join("");
    bodyHtml += `
      <table>
        <thead><tr><th>${escapeHtml(sec.roleColLabel)}</th><th>${escapeHtml(sec.descColLabel)}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // Bang 2 cot tuy y (module / ghi chu) — dung cho phan "quy tac theo tung
  // module" trong muc Phan quyen.
  if (Array.isArray(sec.moduleRules)) {
    bodyHtml += `<h3 style="margin-top:18px;">${escapeHtml(sec.moduleRulesTitle || "")}</h3>`;
    const rows = sec.moduleRules
      .map(([mod, rule]) => `<tr><td><strong>${escapeHtml(mod)}</strong></td><td>${escapeHtml(rule)}</td></tr>`)
      .join("");
    bodyHtml += `<table><tbody>${rows}</tbody></table>`;
  }

  // Bang N cot tuy y theo sec.accountColLabels — dung cho muc Tai khoan Demo.
  if (Array.isArray(sec.accounts) && Array.isArray(sec.accountColLabels)) {
    const headHtml = sec.accountColLabels.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
    const rows = sec.accounts
      .map((row) => `<tr>${row.map((cell, i) => (i === 0 ? `<td><code>${escapeHtml(cell)}</code></td>` : `<td>${escapeHtml(cell)}</td>`)).join("")}</tr>`)
      .join("");
    bodyHtml += `<table><thead><tr>${headHtml}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  if (Array.isArray(sec.items)) {
    // FAQ: moi item la [cau hoi, cau tra loi]
    bodyHtml += sec.items
      .map(
        ([q, a]) => `
        <div class="faq-item">
          <div class="faq-q">${escapeHtml(q)}</div>
          <div class="faq-a">${escapeHtml(a)}</div>
        </div>`
      )
      .join("");
  }

  return `
    <div class="card help-section" id="section-${key}">
      <h2>${escapeHtml(sec.title)}</h2>
      ${sec.intro ? `<p class="subtitle" style="margin-top:-8px;">${escapeHtml(sec.intro)}</p>` : ""}
      ${bodyHtml}
    </div>
  `;
}

function setActiveTocLink(key) {
  document.querySelectorAll(".help-toc a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("data-section") === key);
  });
}

// Cho phep cac trang khac dan link dang /help.html#goodsReceipt de nhay
// thang toi dung phan lien quan (dung cho nut Tro giup tren topbar).
function handleDeepLink() {
  const hash = window.location.hash.replace("#", "");
  if (hash && document.getElementById("section-" + hash)) {
    setTimeout(() => {
      document.getElementById("section-" + hash).scrollIntoView({ behavior: "smooth" });
      setActiveTocLink(hash);
    }, 100);
  } else if (SECTION_ORDER.length > 0) {
    setActiveTocLink(SECTION_ORDER[0]);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
