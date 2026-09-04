// ============================================================================
// scripts/daily-stock-alert.js
//
// Script DOC LAP, tach rieng khoi daily-healthcheck.js — vi muc dich khac
// nhau: health-check la KIEM TRA KY THUAT he thong con song khong, con
// script nay la BAO CAO NGHIEP VU (canh bao ton kho thap) — gop chung se
// lam roi muc dich, kho bao tri ve sau.
//
// Duoc GitHub Actions goi moi ngay vao dau gio lam viec (7h sang), goi API
// /stock-ledger/low-stock-alerts, neu co vat tu nao duoi han muc toi thieu
// thi gui email tong hop.
//
// Chay: node scripts/daily-stock-alert.js
// ============================================================================

const nodemailer = require('nodemailer');

const APP_URL = process.env.APP_URL;
const ADMIN_EMAIL = process.env.SYSTEM_HEALTHCHECK_EMAIL || 'system.healthcheck@sec.com';
const ADMIN_PASSWORD = process.env.SYSTEM_HEALTHCHECK_PASSWORD;
const REPORT_TO_EMAIL = process.env.REPORT_TO_EMAIL;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const REQUIRED_VARS = { APP_URL, ADMIN_PASSWORD, REPORT_TO_EMAIL, GMAIL_USER, GMAIL_APP_PASSWORD };
for (const [key, val] of Object.entries(REQUIRED_VARS)) {
  if (!val) {
    console.error(`LOI: thieu bien moi truong ${key}`);
    process.exit(1);
  }
}

// Dang nhap bang chinh tai khoan bot da co san cho Health Check — vi day
// chi la GET du lieu doc, khong tao/sua gi, dung chung tai khoan nay hop
// ly, khong can tao them tai khoan rieng.
async function login() {
  const res = await fetch(`${APP_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Dang nhap that bai: ${JSON.stringify(data)}`);
  return data.accessToken;
}

async function getLowStockAlerts(token) {
  const res = await fetch(`${APP_URL}/api/stock-ledger/low-stock-alerts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Lay du lieu canh bao that bai: ${JSON.stringify(data)}`);
  return data;
}

async function sendAlertEmail(alertData) {
  const rowsHtml = alertData.alerts
    .map(
      (a) => `
      <tr>
        <td style="padding:8px 12px; border-bottom:1px solid #eee;">${a.itemName} (${a.itemCode})</td>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:right;">${a.totalBalance} ${a.unit}</td>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:right;">${a.minStock} ${a.unit}</td>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:right; color:#c00; font-weight:bold;">${a.shortage} ${a.unit}</td>
      </tr>`,
    )
    .join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2 style="color:#8a5a00;">⚠️ Cảnh báo tồn kho — Kho NPL</h2>
      <p>Có <strong>${alertData.count}</strong> vật tư đang dưới hạn mức tồn kho tối thiểu, tính đến ${new Date().toLocaleString('vi-VN')}.</p>
      <table style="width:100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background:#fdf3e0;">
            <th style="padding:8px 12px; text-align:left;">Vật tư</th>
            <th style="padding:8px 12px; text-align:right;">Tồn hiện tại</th>
            <th style="padding:8px 12px; text-align:right;">Hạn mức tối thiểu</th>
            <th style="padding:8px 12px; text-align:right;">Đang thiếu</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="color:#888; font-size:12px; margin-top:20px;">
        Xem chi tiết và đề xuất mua thêm tại <a href="${APP_URL}/dashboard.html">${APP_URL}</a> — email tự động, không cần trả lời.
      </p>
    </div>
  `;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  await transporter.sendMail({
    from: `"Kho NPL - Cảnh báo tồn kho" <${GMAIL_USER}>`,
    to: REPORT_TO_EMAIL,
    subject: `⚠️ [Kho NPL] ${alertData.count} vật tư đang dưới hạn mức tồn kho`,
    html,
  });

  console.log(`Da gui email canh bao (${alertData.count} vat tu duoi han muc).`);
}

async function main() {
  const token = await login();
  const alertData = await getLowStockAlerts(token);

  if (alertData.count === 0) {
    console.log('Khong co vat tu nao duoi han muc ton kho — khong gui email.');
    return;
  }

  await sendAlertEmail(alertData);
}

main().catch((err) => {
  console.error('Loi khi chay canh bao ton kho:', err.message);
  process.exit(1);
});
