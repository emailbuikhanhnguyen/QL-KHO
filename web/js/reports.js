requireAuth();
renderTopbar("reports");

let itemsCache = [];
let warehousesCache = [];

(async function init() {
  await loadDropdownData();
  await loadBalance();
})();

async function loadDropdownData() {
  const [items, wh] = await Promise.all([
    apiFetch("/items?limit=100"),
    apiFetch("/warehouses?limit=100"),
  ]);
  itemsCache = items.ok ? items.data.data : [];
  warehousesCache = wh.ok ? wh.data.data : [];

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
  document.getElementById("tabBalance").classList.toggle("active", tab === "balance");
  document.getElementById("tabHistory").classList.toggle("active", tab === "history");
  if (tab === "history") loadHistory();
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
  container.innerHTML = "Đang tải...";

  const res = await apiFetch(`/stock-ledger/balance?${qs}`);
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }

  const rows = res.data;
  if (rows.length === 0) {
    container.innerHTML = `<div class="empty-state">Không có dữ liệu tồn kho phù hợp.</div>`;
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
      <thead><tr><th>Mã VT</th><th>Tên vật tư</th><th>Kho</th><th>Tồn hiện tại</th><th>Đơn vị</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

async function exportBalance() {
  const itemId = document.getElementById("balance_itemId").value;
  const warehouseId = document.getElementById("balance_warehouseId").value;
  const qs = buildQueryParams(itemId, warehouseId);

  const result = await apiDownloadFile(`/stock-ledger/balance/export?${qs}`, "ton-kho.xlsx");
  if (!result.ok) {
    alert("Xuất Excel thất bại: " + extractErrorMessage(result.data));
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
  container.innerHTML = "Đang tải...";

  const res = await apiFetch(`/stock-ledger/transactions?${qs}`);
  if (!res.ok) {
    container.innerHTML = `<div class="error-box show">${extractErrorMessage(res.data)}</div>`;
    return;
  }

  const rows = res.data.data;
  if (rows.length === 0) {
    container.innerHTML = `<div class="empty-state">Không có giao dịch nào phù hợp.</div>`;
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
      <thead><tr><th>Ngày</th><th>Loại</th><th>Vật tư</th><th>Lô</th><th>Kho</th><th>Số lượng</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p style="color: var(--muted); font-size: 12px; margin-top: 10px;">Hiển thị tối đa 100 giao dịch gần nhất. Dùng nút "Xuất Excel" để lấy đầy đủ.</p>`;
}

async function exportHistory() {
  const itemId = document.getElementById("history_itemId").value;
  const warehouseId = document.getElementById("history_warehouseId").value;
  const movementType = document.getElementById("history_movementType").value;
  const qs = buildQueryParams(itemId, warehouseId, { movementType });

  const result = await apiDownloadFile(`/stock-ledger/transactions/export?${qs}`, "lich-su-ton-kho.xlsx");
  if (!result.ok) {
    alert("Xuất Excel thất bại: " + extractErrorMessage(result.data));
  }
}
