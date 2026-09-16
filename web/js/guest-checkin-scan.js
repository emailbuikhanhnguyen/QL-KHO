requireAuth();

let html5QrCode = null;
let isPaused = false;
let pendingRegistrationId = null;

const GUEST_QR_PREFIX = "GUEST_CHECKIN:";

// -------------------------------------------------------------------------
// Khoi tao: tai i18n truoc, roi moi bat camera quet QR — dung y het pattern
// da co o stocktake-scan.js.
// -------------------------------------------------------------------------
window.addEventListener("load", async () => {
  await loadI18n();
  applyTranslations();
  document.getElementById("langSwitcherSlot").innerHTML = renderLanguageSwitcher();

  html5QrCode = new Html5Qrcode("qr-reader");
  html5QrCode
    .start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      () => {
        /* Loi quet tung khung hinh — binh thuong, cu tiep tuc thu */
      },
    )
    .catch(() => {
      showStatus(t("guestScan.cameraError"), "error");
    });
});

async function onScanSuccess(decodedText) {
  if (isPaused) return;

  if (!decodedText.startsWith(GUEST_QR_PREFIX)) {
    showStatus(t("guestScan.invalidQrFormat"), "error");
    return;
  }

  // Payload dang: GUEST_CHECKIN:<id>:<code> — chi can id, phan code chi
  // de nguoi doc mat QR bang mat thuong doi soat, khong dung de xu ly.
  const parts = decodedText.split(":");
  const id = Number(parts[1]);
  if (!id) {
    showStatus(t("guestScan.cannotReadId"), "error");
    return;
  }

  isPaused = true;
  showStatus(t("common.loading"), "");

  const res = await apiFetch(`/guest-registrations/${id}`);
  if (!res.ok) {
    showStatus(extractErrorMessage(res.data), "error");
    isPaused = false;
    return;
  }

  const r = res.data;
  pendingRegistrationId = id;
  document.getElementById("resultVisitorName").textContent = r.visitorFullName;
  document.getElementById("resultCompanyName").textContent = r.companyName;
  document.getElementById("resultIdNumber").textContent = r.idNumber;
  document.getElementById("resultCard").classList.add("show");
  showStatus("", "");
}

async function confirmCheckIn() {
  const btn = document.getElementById("confirmBtn");
  btn.disabled = true;

  const res = await apiFetch(`/guest-registrations/${pendingRegistrationId}/check-in`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  btn.disabled = false;

  if (!res.ok) {
    showStatus(extractErrorMessage(res.data), "error");
    return;
  }

  showStatus(t("guestScan.checkInSuccess"), "success");
  document.getElementById("resultCard").classList.remove("show");
  pendingRegistrationId = null;

  // Tam dung camera 1.5s de nguoi dung doc duoc thong bao thanh cong,
  // roi tu dong bat lai de quet nguoi tiep theo — giong het stocktake-scan.
  setTimeout(() => {
    isPaused = false;
    showStatus("", "");
  }, 1500);
}

function showStatus(msg, type) {
  const el = document.getElementById("statusMsg");
  el.textContent = msg;
  el.className = "status-msg" + (type ? " " + type : "");
}
