requireAuth();

let itemsCache = [];
let warehousesCache = [];

(async function init() {
  await loadI18n();
  renderTopbar("reports");
  applyTranslations();
  await loadDropdownData();
  await loadBalance();
})();

async function loadDropdownData() {
  const [items, wh] = await Promise.all([
    apiFetch("/items?limit=100"),
    apiFetch("/warehouses?limit=100"),
  ]);
  itemsCache = items.ok ? items.data.data : [];
  // Loai bo vat tu/kho rieng phuc vu may tu dong kiem tra suc khoe he
  // thong — tranh nguoi dung that chon nham trong dropdown loc bao cao.
  itemsCache = itemsCache.filter((i) => !i.code.startsWith("HEALTHCHECK"));
  const SYSTEM_WAREHOUSE_CODES = ["IN_TRANSIT", "SYSTEM_TEST"];
  warehousesCache = (wh.ok ? wh.data.data : []).filter((w) => !SYSTEM_WAREHOUSE_CODES.includes(w.code));

  const itemOptions = itemsCache.map((i) => `<option value="${i.id}">${i.name} (${i.code})</option>`).join("");
  const whOptions = warehousesCache.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");

  ["balance_itemId", "history_itemId"].forEach((id) => {
    document.getElementById(id).innerHTML += itemOptions;
  });
  ["balance_warehouseId", "history_warehouseId"].forEach((id) => {
    document.getElementById(id).innerHTML += whOptions;
  });
}

function switchTab(tab) {
  document.getElementById("balanceCard").style.display = tab === "balance" ? "block" : "none";
  document.getElementById("historyCard").style.display = tab === "history" ? "block" : "none";
  document.getElementById("alertsCard").style.display = tab === "alerts" ? "block" : "none";
  document.getElementById("tabBalance").classList.toggle("active", tab === "balance");
  document.getElementById("tabHistory").classList.toggle("active", tab === "history");
  document.getElementById("tabAlerts").classList.toggle("active", tab === "alerts");
  if (tab === "history") loadHistory();
  if (tab === "alerts") loadAlerts();
}

async function loadAlerts() {
  const container = document.getElementById("alertsContainer");
  container.innerHTML = t("common.loading");
  const res = await apiFetch("/stock-ledger/low-stock-alerts");
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }
  const { alerts } = res.data;
  if (alerts.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("reports.alertsEmpty")}</div>`;
    return;
  }
  const rows = alerts
    .map(
      (a) => `
      <tr>
        <td>${a.itemName} (${a.itemCode})</td>
        <td>${formatNumber(a.totalBalance)} ${a.unit}</td>
        <td>${formatNumber(a.minStock)} ${a.unit}</td>
        <td><strong style="color:#c00;">${formatNumber(a.shortage)} ${a.unit}</strong></td>
      </tr>`,
    )
    .join("");
  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("reports.itemLabel")}</th>
        <th>${t("reports.alertsCurrentCol")}</th>
        <th>${t("reports.alertsMinCol")}</th>
        <th>${t("reports.alertsShortageCol")}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function itemName(id) {
  const i = itemsCache.find((x) => x.id === id);
  return i ? `${i.name} (${i.code})` : `#${id}`;
}

function warehouseName(id) {
  const w = warehousesCache.find((x) => x.id === id);
  return w ? w.name : `#${id}`;
}

function buildQueryParams(itemId, warehouseId, extra = {}) {
  const params = new URLSearchParams();
  if (itemId) params.set("itemId", itemId);
  if (warehouseId) params.set("warehouseId", warehouseId);
  for (const [k, v] of Object.entries(extra)) {
    if (v) params.set(k, v);
  }
  return params.toString();
}

// -------------------------------------------------------------------------
// TON KHO HIEN TAI
// -------------------------------------------------------------------------
async function loadBalance() {
  const itemId = document.getElementById("balance_itemId").value;
  const warehouseId = document.getElementById("balance_warehouseId").value;
  const qs = buildQueryParams(itemId, warehouseId);

  const container = document.getElementById("balanceContainer");
  container.innerHTML = t("common.loading");

  const res = await apiFetch(`/stock-ledger/balance?${qs}`);
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }

  // Loc bo dong cua vat tu he thong (HEALTHCHECK) — de phong truong hop
  // nguoi dung xem "Tat ca vat tu" (khong loc rieng) van co the thay du
  // lieu test lan vao.
  const rows = res.data.filter((r) => !r.item || !r.item.code.startsWith("HEALTHCHECK"));
  if (rows.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("reports.emptyBalance")}</div>`;
    return;
  }

  const rowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td>${r.item ? r.item.code : "#" + r.itemId}</td>
        <td>${r.item ? r.item.name : "—"}</td>
        <td>${r.warehouse ? r.warehouse.name : "#" + r.warehouseId}</td>
        <td><strong>${formatNumber(r.balance)}</strong></td>
        <td>${r.item ? r.item.unit : "—"}</td>
      </tr>`
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("reports.tableItemCode")}</th>
        <th>${t("reports.tableItemName")}</th>
        <th>${t("reports.tableWarehouse")}</th>
        <th>${t("reports.tableCurrentBalance")}</th>
        <th>${t("reports.tableUnit")}</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

async function exportBalance() {
  const itemId = document.getElementById("balance_itemId").value;
  const warehouseId = document.getElementById("balance_warehouseId").value;
  const qs = buildQueryParams(itemId, warehouseId);

  const result = await apiDownloadFile(`/stock-ledger/balance/export?${qs}`, "ton-kho.xlsx");
  if (!result.ok) {
    alert(t("reports.exportFailedAlert") + extractErrorMessage(result.data));
  }
}

// -------------------------------------------------------------------------
// LICH SU BIEN DONG
// -------------------------------------------------------------------------
async function loadHistory() {
  const itemId = document.getElementById("history_itemId").value;
  const warehouseId = document.getElementById("history_warehouseId").value;
  const movementType = document.getElementById("history_movementType").value;
  const qs = buildQueryParams(itemId, warehouseId, { movementType, limit: 100 });

  const container = document.getElementById("historyContainer");
  container.innerHTML = t("common.loading");

  const res = await apiFetch(`/stock-ledger/transactions?${qs}`);
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }

  // Loc bo dong cua vat tu he thong (HEALTHCHECK) — tuong tu loadBalance().
  const rows = res.data.data.filter((e) => !e.item || !e.item.code.startsWith("HEALTHCHECK"));
  if (rows.length === 0) {
    container.innerHTML = `<div class="empty-state">${t("reports.emptyHistory")}</div>`;
    return;
  }

  const rowsHtml = rows
    .map(
      (e) => `
      <tr>
        <td>${formatDateTime(e.createdAt)}</td>
        <td>${statusBadge(e.movementType)}</td>
        <td>${e.item ? e.item.name : "#" + e.itemId}</td>
        <td>${e.lot ? e.lot.lotCode : "—"}</td>
        <td>${e.warehouse ? e.warehouse.name : "#" + e.warehouseId}</td>
        <td style="color: ${Number(e.quantity) < 0 ? 'var(--danger)' : 'var(--success)'}; font-weight:600;">
          ${Number(e.quantity) > 0 ? "+" : ""}${formatNumber(e.quantity)}
        </td>
      </tr>`
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>${t("reports.tableDate")}</th>
        <th>${t("reports.tableType")}</th>
        <th>${t("reports.itemLabel")}</th>
        <th>${t("reports.tableLot")}</th>
        <th>${t("reports.warehouseLabel")}</th>
        <th>${t("reports.tableQuantity")}</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p style="color: var(--muted); font-size: 12px; margin-top: 10px;">${t("reports.historyLimitNote")}</p>`;
}

async function exportHistory() {
  const itemId = document.getElementById("history_itemId").value;
  const warehouseId = document.getElementById("history_warehouseId").value;
  const movementType = document.getElementById("history_movementType").value;
  const qs = buildQueryParams(itemId, warehouseId, { movementType });

  const result = await apiDownloadFile(`/stock-ledger/transactions/export?${qs}`, "lich-su-ton-kho.xlsx");
  if (!result.ok) {
    alert(t("reports.exportFailedAlert") + extractErrorMessage(result.data));
  }
}
