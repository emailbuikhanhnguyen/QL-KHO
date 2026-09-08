requireAuth();

(async function init() {
  await loadI18n();
  renderTopbar("meal");
  applyTranslations();

  // Mac dinh chon ngay mai (thuong dang ky truoc cho hom sau)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isoTomorrow = tomorrow.toISOString().slice(0, 10);
  document.getElementById("f_mealDate").value = isoTomorrow;

  const user = getCurrentUser();
  if (user && (user.role === "HR" || user.role === "ADMIN")) {
    document.getElementById("summaryCard").style.display = "block";
    document.getElementById("f_summaryDate").value = isoTomorrow;
    loadSummary();
  }

  await loadMyHistory();
})();

// -------------------------------------------------------------------------
// DANG KY / SUA / HUY
// -------------------------------------------------------------------------
async function submitRegister() {
  hideError("registerError");
  const body = {
    mealDate: document.getElementById("f_mealDate").value,
    hasLunch: document.getElementById("f_hasLunch").checked,
    hasOvertimeMeal: document.getElementById("f_hasOvertimeMeal").checked,
  };

  if (!body.mealDate) {
    showError("registerError", t("meal.selectDateFirst"));
    return;
  }

  const res = await apiFetch("/meal-registrations", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    showError("registerError", extractErrorMessage(res.data));
    return;
  }

  showSuccess("registerSuccess", t("meal.registerSuccess"));
  await loadMyHistory();
}

async function doCancel() {
  hideError("registerError");
  const mealDate = document.getElementById("f_mealDate").value;
  if (!mealDate) {
    showError("registerError", t("meal.selectDateFirst"));
    return;
  }
  if (!confirm(t("meal.cancelConfirm"))) return;

  const res = await apiFetch(`/meal-registrations/${mealDate}`, { method: "DELETE" });
  if (!res.ok) {
    showError("registerError", extractErrorMessage(res.data));
    return;
  }

  showSuccess("registerSuccess", t("meal.cancelSuccess"));
  await loadMyHistory();
}

// -------------------------------------------------------------------------
// LICH SU CUA TOI
// -------------------------------------------------------------------------
async function loadMyHistory() {
  const container = document.getElementById("myHistoryContainer");
  const res = await apiFetch("/meal-registrations/mine");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const rows = res.data;
  if (rows.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("meal.emptyHistory")}</div>`;
    return;
  }

  const rowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td>${formatDate(r.mealDate)}</td>
        <td>${r.hasLunch ? "✔" : "—"}</td>
        <td>${r.hasOvertimeMeal ? "✔" : "—"}</td>
        <td>${r.cancelledAt ? `<span class="badge badge-danger">${t("meal.cancelledLabel")}</span>` : `<span class="badge badge-success">${t("meal.activeLabel")}</span>`}</td>
      </tr>`,
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("meal.dateLabel")}</th>
        <th>${t("meal.lunchLabel")}</th>
        <th>${t("meal.otMealLabel")}</th>
        <th>${t("common.status")}</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

// -------------------------------------------------------------------------
// BAO CAO TONG HOP (HR/Admin)
// -------------------------------------------------------------------------
async function loadSummary() {
  const date = document.getElementById("f_summaryDate").value;
  if (!date) return;
  const container = document.getElementById("summaryContainer");
  container.innerHTML = t("common.loading");

  const res = await apiFetch(`/meal-registrations/summary?date=${date}`);
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const s = res.data;

  const byDeptRows = s.byDepartment
    .map((d) => `<tr><td>${d.departmentName}</td><td>${d.lunch}</td><td>${d.overtimeMeal}</td></tr>`)
    .join("");

  container.innerHTML = `
    <div class="detail-grid" style="margin-bottom:16px;">
      <div class="detail-field"><div class="label">${t("meal.totalLunchLabel")}</div><div class="value">${s.totalLunch}</div></div>
      <div class="detail-field"><div class="label">${t("meal.totalOtMealLabel")}</div><div class="value">${s.totalOvertimeMeal}</div></div>
    </div>
    ${
      s.byDepartment.length > 0
        ? `<table>
            <thead><tr><th>${t("common.department")}</th><th>${t("meal.lunchLabel")}</th><th>${t("meal.otMealLabel")}</th></tr></thead>
            <tbody>${byDeptRows}</tbody>
          </table>`
        : `<div class="empty-state">${t("meal.emptySummary")}</div>`
    }
  `;
}
