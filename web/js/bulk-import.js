requireAuth();

(async function init() {
  await loadI18n();
  renderTopbar(null);
  applyTranslations();

  const user = getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    document.getElementById("deniedCard").style.display = "block";
    document.getElementById("uploadCard").style.display = "none";
  }
})();

async function submitImport(event) {
  hideError("uploadError");
  const fileInput = document.getElementById("f_file");
  const file = fileInput.files[0];

  if (!file) {
    showError("uploadError", t("bulkImport.chooseFileFirst"));
    return;
  }

  const btn = event.target;
  btn.disabled = true;
  document.getElementById("resultCard").style.display = "none";

  // apiUpload() co san trong api.js — dung dung field "file" giong
  // backend mong doi (FileInterceptor('file', ...)).
  const res = await apiUpload("/auth/users/bulk-import", file);

  btn.disabled = false;

  if (!res.ok) {
    showError("uploadError", extractErrorMessage(res.data));
    return;
  }

  renderResult(res.data);
}

function renderResult(summary) {
  document.getElementById("resultCard").style.display = "block";

  document.getElementById("summaryBox").innerHTML = `
    <div class="summary-item"><div class="num">${summary.totalRows}</div><div class="label">${t("bulkImport.totalRows")}</div></div>
    <div class="summary-item"><div class="num" style="color:var(--success);">${summary.successCount}</div><div class="label">${t("bulkImport.successCount")}</div></div>
    <div class="summary-item"><div class="num" style="color:var(--danger);">${summary.errorCount}</div><div class="label">${t("bulkImport.errorCount")}</div></div>
  `;

  const rows = summary.results
    .map((r) => {
      const cls = r.success ? "result-row-success" : "result-row-error";
      const detail = r.success
        ? `<span class="temp-password">${escapeHtml(r.tempPassword)}</span>${r.error ? `<br><span style="color:var(--warning);">${escapeHtml(r.error)}</span>` : ""}`
        : `<span class="result-row-error">${escapeHtml(r.error || "")}</span>`;
      return `
        <tr>
          <td>${r.row}</td>
          <td>${escapeHtml(r.employeeCode || "—")}</td>
          <td>${escapeHtml(r.email)}</td>
          <td class="${cls}">${r.success ? t("bulkImport.statusOk") : t("bulkImport.statusFail")}</td>
          <td>${detail}</td>
        </tr>`;
    })
    .join("");

  document.getElementById("resultContainer").innerHTML = `
    <table>
      <thead><tr>
        <th>${t("bulkImport.colRow")}</th>
        <th>${t("bulkImport.colEmployeeCode")}</th>
        <th>${t("bulkImport.colEmail")}</th>
        <th>${t("common.status")}</th>
        <th>${t("bulkImport.colDetail")}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint" style="margin-top:12px;">${t("bulkImport.copyHint")}</p>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
