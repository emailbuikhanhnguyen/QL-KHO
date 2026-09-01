requireAuth();

let html5QrCode = null;
let currentStocktakeId = null;
let currentLineId = null;
let isPaused = false;

const LOT_QR_PREFIX = "KHO-LOT-";

// -------------------------------------------------------------------------
// Khoi tao: tai i18n truoc, roi moi bat camera quet QR
// -------------------------------------------------------------------------
window.addEventListener("load", async () => {
  await loadI18n();
  applyTranslations();
  document.getElementById("langSwitcherSlot").innerHTML = renderLanguageSwitcher();

  html5QrCode = new Html5Qrcode("qr-reader");
  html5QrCode
    .start(
      { facingMode: "environment" }, // camera sau, khong phai camera selfie
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      () => {
        /* Loi quet tung khung hinh — binh thuong, khong lam gi ca, cu tiep tuc thu */
      }
    )
    .catch((err) => {
      showStatus(t("scan.cameraError"), "error");
    });
});

function onScanSuccess(decodedText) {
  if (isPaused) return; // dang xu ly ket qua truoc, bo qua quet lien tuc

  if (!decodedText.startsWith(LOT_QR_PREFIX)) {
    showStatus(t("scan.invalidQrFormat"), "error");
    return;
  }

  const lotId = Number(decodedText.replace(LOT_QR_PREFIX, ""));
  if (!lotId) {
    showStatus(t("scan.cannotReadLotId"), "error");
    return;
  }

  pauseScanning();
  lookupLot(lotId);
}

function pauseScanning() {
  isPaused = true;
  if (html5QrCode) html5QrCode.pause(true);
}

function resumeScanning() {
  isPaused = false;
  if (html5QrCode) html5QrCode.resume();
  document.getElementById("resultCard").classList.remove("show");
}

// -------------------------------------------------------------------------
// Tra cuu dong kiem ke tuong ung voi lo vua quet
// -------------------------------------------------------------------------
async function lookupLot(lotId) {
  showStatus(t("scan.searching"), "");

  const res = await apiFetch(`/stocktakes/find-line-by-lot?lotId=${lotId}`);

  if (!res.ok) {
    showStatus(extractErrorMessage(res.data), "error");
    // Tu dong quet lai sau 2.5 giay, khong bat nguoi dung phai bam gi
    setTimeout(resumeScanning, 2500);
    return;
  }

  const line = res.data;
  currentStocktakeId = line.stocktakeId;
  currentLineId = line.id;

  const itemName = line.lot && line.lot.item ? line.lot.item.name : "—";
  const lotCode = line.lot ? line.lot.lotCode : "";

  document.getElementById("resultItemName").textContent = itemName;
  document.getElementById("resultLotCode").textContent = `${t("qc.tableLot")}: ${lotCode}`;
  document.getElementById("resultSystemQty").textContent = formatNumber(line.systemQuantity);

  const countedInput = document.getElementById("countedQtyInput");
  countedInput.value = line.countedQuantity !== null ? line.countedQuantity : "";

  document.getElementById("resultCard").classList.add("show");
  showStatus("", "");
  countedInput.focus();
}

// -------------------------------------------------------------------------
// Xac nhan so dem
// -------------------------------------------------------------------------
async function confirmCount() {
  const countedQuantity = Number(document.getElementById("countedQtyInput").value);
  if (countedQuantity === null || countedQuantity === undefined || isNaN(countedQuantity)) {
    showStatus(t("scan.invalidQuantity"), "error");
    return;
  }

  const btn = document.getElementById("confirmBtn");
  btn.disabled = true;
  btn.textContent = t("scan.saving");

  const res = await apiFetch(`/stocktakes/${currentStocktakeId}/lines/${currentLineId}`, {
    method: "PUT",
    body: JSON.stringify({ countedQuantity }),
  });

  btn.disabled = false;
  btn.textContent = t("scan.confirmBtn");

  if (!res.ok) {
    showStatus(extractErrorMessage(res.data), "error");
    return;
  }

  showStatus(t("scan.savedNext"), "success");
  setTimeout(resumeScanning, 1200);
}

// -------------------------------------------------------------------------
// Nhap thu cong (khi khong quet duoc — den yeu, tem hong...)
// -------------------------------------------------------------------------
function toggleManualEntry() {
  document.getElementById("manualForm").classList.toggle("show");
}

function lookupManual() {
  const lotId = Number(document.getElementById("manualLotId").value);
  if (!lotId) {
    showStatus(t("scan.invalidManualId"), "error");
    return;
  }
  pauseScanning();
  lookupLot(lotId);
}

// -------------------------------------------------------------------------
// Helper hien thi trang thai
// -------------------------------------------------------------------------
function showStatus(message, type) {
  const el = document.getElementById("statusMsg");
  el.textContent = message;
  el.className = "status-msg" + (type ? " " + type : "");
}
