// ============================================================================
// scripts/daily-healthcheck.js
//
// Script DOC LAP, KHONG chay ben trong app NestJS — duoc GitHub Actions goi
// tu ben ngoai theo lich moi ngay. Muc dich:
//   1. "Danh thuc" app tren Render free (dang co the dang ngu) va Supabase
//      free (tranh bi tu dong pause sau 7 ngay khong hoat dong) — bang cach
//      thuc su goi API va ghi du lieu that vao database.
//   2. Tu dong kiem tra luong loi (Nhap kho -> QC -> Xuat kho) con hoat dong
//      dung khong — phat hien som neu co loi trien khai.
//   3. Bao cao qua email: ket qua tung buoc + co nguoi dung THAT dung he
//      thong hom nay khong.
//
// Toan bo du lieu test duoc tao tren 1 KHO RIENG BIET (SYSTEM_TEST) —
// khong bao gio dung tren 3 kho that (RM/Color Kitchen/FG), nen khong lam
// "ban" bao cao ma Thanh xem hang ngay.
//
// KHONG test Dieu chuyen kho va Kiem ke — Dieu chuyen can 2 kho that khac
// nhau (kho test chi co 1), va Kiem ke co co che khoa giao dich — de tranh
// rui ro khoa nham luc co nguoi dang kiem ke that, module nay duoc loai
// khoi kiem tra tu dong co chu dich.
//
// Chay: node scripts/daily-healthcheck.js
// Yeu cau bien moi truong: xem phan CONFIG ben duoi.
// ============================================================================

const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// CONFIG — lay tu bien moi truong (GitHub Secrets se bom vao luc chay)
// ---------------------------------------------------------------------------
const APP_URL = process.env.APP_URL; // vd: https://kho-npl.onrender.com
const SYSTEM_EMAIL = 'system.healthcheck@sec.com';
const SYSTEM_PASSWORD = process.env.SYSTEM_HEALTHCHECK_PASSWORD;
const WAREHOUSE_ID = Number(process.env.SYSTEM_TEST_WAREHOUSE_ID);
const ITEM_ID = Number(process.env.HEALTHCHECK_ITEM_ID);
const SUPPLIER_ID = Number(process.env.HEALTHCHECK_SUPPLIER_ID);

const REPORT_TO_EMAIL = process.env.REPORT_TO_EMAIL;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const REQUIRED_VARS = {
  APP_URL,
  SYSTEM_HEALTHCHECK_PASSWORD: SYSTEM_PASSWORD,
  SYSTEM_TEST_WAREHOUSE_ID: WAREHOUSE_ID,
  HEALTHCHECK_ITEM_ID: ITEM_ID,
  HEALTHCHECK_SUPPLIER_ID: SUPPLIER_ID,
  REPORT_TO_EMAIL,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
};
for (const [key, val] of Object.entries(REQUIRED_VARS)) {
  if (!val) {
    console.error(`LOI: thieu bien moi truong ${key}`);
    process.exit(1);
  }
}

const results = []; // { name, status: 'PASS'|'FAIL', message, durationMs }
let token = null;

// ---------------------------------------------------------------------------
// Helper: goi API co retry — xu ly truong hop Render free dang "ngu",
// lan goi dau tien co the mat 30-60s de "thuc day".
// ---------------------------------------------------------------------------
async function apiCall(path, options = {}, { retries = 6, retryDelayMs = 15000 } = {}) {
  const url = `${APP_URL}/api${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status >= 500 || res.status === 0) {
        throw new Error(`Server loi ${res.status}`);
      }
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.log(`  (Thu lai lan ${attempt}/${retries} sau ${retryDelayMs / 1000}s — co the app dang "thuc day")`);
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  }
  throw lastError;
}

async function step(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, status: 'PASS', message: '', durationMs: Date.now() - start });
    console.log(`✅ ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    results.push({ name, status: 'FAIL', message: err.message, durationMs: Date.now() - start });
    console.error(`❌ ${name}: ${err.message}`);
    throw err; // dung luon chuoi test neu 1 buoc that bai — cac buoc sau phu thuoc buoc truoc
  }
}

// ---------------------------------------------------------------------------
// MAIN — chay tuan tu tung buoc
// ---------------------------------------------------------------------------
async function main() {
  const suffix = Date.now();
  let lotId, goodsReceiptId, qcInspectionId, issueRequestId;

  await step('Dang nhap tai khoan he thong', async () => {
    const res = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: SYSTEM_EMAIL, password: SYSTEM_PASSWORD }),
    });
    if (!res.ok) throw new Error(`Dang nhap that bai: ${JSON.stringify(res.data)}`);
    token = res.data.accessToken;
  });

  await step('Tao phieu nhap kho (kho test)', async () => {
    const res = await apiCall('/goods-receipts', {
      method: 'POST',
      body: JSON.stringify({
        warehouseId: WAREHOUSE_ID,
        supplierId: SUPPLIER_ID,
        note: 'Health check tu dong',
        lines: [{ itemId: ITEM_ID, lotCode: `HC-${suffix}`, quantity: 10 }],
      }),
    }, { retries: 1 }); // qua buoc dau da "thuc day" xong, khong can retry dai nua
    if (!res.ok) throw new Error(JSON.stringify(res.data));
    goodsReceiptId = res.data.id;
  });

  await step('Gui duyet + duyet phieu nhap', async () => {
    let res = await apiCall(`/goods-receipts/${goodsReceiptId}/submit`, { method: 'POST' });
    if (!res.ok) throw new Error(`Submit: ${JSON.stringify(res.data)}`);
    res = await apiCall(`/goods-receipts/${goodsReceiptId}/approve`, { method: 'POST' });
    if (!res.ok) throw new Error(`Approve: ${JSON.stringify(res.data)}`);
    lotId = res.data.lines[0].lotId;
    if (!lotId) throw new Error('Khong thay lotId sau khi duyet');
  });

  await step('Tao + duyet phieu QC (kem upload anh)', async () => {
    let res = await apiCall('/qc-inspections', {
      method: 'POST',
      body: JSON.stringify({ lotId, result: 'PASSED', notes: 'Health check tu dong' }),
    });
    if (!res.ok) throw new Error(`Tao QC: ${JSON.stringify(res.data)}`);
    qcInspectionId = res.data.id;

    // Upload 1 anh test toi thieu (1x1 px PNG) — dung FormData/Blob co san tu Node 18+
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const formData = new FormData();
    formData.append('file', new Blob([pngBytes], { type: 'image/png' }), 'test.png');

    const uploadRes = await fetch(`${APP_URL}/api/qc-inspections/${qcInspectionId}/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!uploadRes.ok) throw new Error(`Upload anh that bai: ${uploadRes.status}`);

    res = await apiCall(`/qc-inspections/${qcInspectionId}/submit`, { method: 'POST' });
    if (!res.ok) throw new Error(`Submit QC: ${JSON.stringify(res.data)}`);
    res = await apiCall(`/qc-inspections/${qcInspectionId}/approve`, { method: 'POST' });
    if (!res.ok) throw new Error(`Approve QC: ${JSON.stringify(res.data)}`);
  });

  await step('Tao + duyet + thuc xuat phieu xuat kho', async () => {
    let res = await apiCall('/issue-requests', {
      method: 'POST',
      body: JSON.stringify({
        warehouseId: WAREHOUSE_ID,
        reason: 'Health check tu dong',
        lines: [{ itemId: ITEM_ID, requestedQuantity: 5 }],
      }),
    });
    if (!res.ok) throw new Error(`Tao issue: ${JSON.stringify(res.data)}`);
    issueRequestId = res.data.id;

    res = await apiCall(`/issue-requests/${issueRequestId}/submit`, { method: 'POST' });
    if (!res.ok) throw new Error(`Submit: ${JSON.stringify(res.data)}`);
    res = await apiCall(`/issue-requests/${issueRequestId}/approve-head`, { method: 'POST' });
    if (!res.ok) throw new Error(`Approve head: ${JSON.stringify(res.data)}`);
    res = await apiCall(`/issue-requests/${issueRequestId}/approve-bod`, { method: 'POST' });
    if (!res.ok) throw new Error(`Approve BOD: ${JSON.stringify(res.data)}`);
    res = await apiCall(`/issue-requests/${issueRequestId}/issue`, { method: 'POST' });
    if (!res.ok) throw new Error(`Issue: ${JSON.stringify(res.data)}`);

    const issuedQty = Number(res.data.lines[0].issuedQuantity);
    if (issuedQty !== 5) throw new Error(`Xuat sai so luong: mong 5, thuc te ${issuedQty}`);
  });

  let activityToday = null;
  await step('Kiem tra hoat dong nguoi dung that hom nay', async () => {
    const res = await apiCall('/health-check/activity-today');
    if (!res.ok) throw new Error(JSON.stringify(res.data));
    activityToday = res.data;
  });

  return activityToday;
}

// ---------------------------------------------------------------------------
// Gui email bao cao
// ---------------------------------------------------------------------------
async function sendReportEmail(activityToday, fatalError) {
  const allPassed = results.every((r) => r.status === 'PASS');
  const subject = allPassed
    ? '✅ [Kho NPL] Health Check hàng ngày / Daily Health Check / 每日健康检查 — Hệ thống hoạt động bình thường'
    : '🔴 [Kho NPL] Health Check hàng ngày / Daily Health Check / 每日健康检查 — PHÁT HIỆN LỖI / ISSUE DETECTED / 发现问题';

  const stepsHtml = results
    .map(
      (r) =>
        `<tr>
          <td style="padding:6px 10px; border-bottom:1px solid #eee;">${r.status === 'PASS' ? '✅' : '❌'} ${r.name}</td>
          <td style="padding:6px 10px; border-bottom:1px solid #eee; text-align:right;">${r.durationMs}ms</td>
          <td style="padding:6px 10px; border-bottom:1px solid #eee; color:#c00;">${r.message || ''}</td>
        </tr>`,
    )
    .join('');

  const activityHtml = activityToday
    ? activityToday.hasRealActivity
      ? `<p style="color:#1e7b34; font-weight:bold;">
           ✅ Có người dùng thật demo hệ thống hôm nay (${activityToday.date}).<br/>
           <span style="font-weight:normal; color:#555; font-size:12px;">Real user activity detected today. / 今天检测到真实用户活动。</span>
         </p>
         <ul>
           <li>Phiếu nhập kho / Goods Receipts / 入库单: ${activityToday.breakdown.goodsReceipts}</li>
           <li>Phiếu QC / QC Inspections / 质检单: ${activityToday.breakdown.qcInspections}</li>
           <li>Phiếu xuất kho / Issue Requests / 出库单: ${activityToday.breakdown.issueRequests}</li>
           <li>Phiếu điều chuyển / Transfers / 调拨单: ${activityToday.breakdown.warehouseTransfers}</li>
           <li>Phiên kiểm kê / Stocktakes / 盘点单: ${activityToday.breakdown.stocktakes}</li>
         </ul>`
      : `<p style="color:#888;">
           — Chưa có ai demo hệ thống hôm nay (${activityToday.date}).<br/>
           <span style="font-size:12px;">No real user activity yet today. / 今天尚无真实用户活动。</span>
         </p>`
    : `<p style="color:#c00;">
         Không lấy được thông tin hoạt động (có thể do bước kiểm tra bị lỗi).<br/>
         <span style="font-size:12px;">Could not retrieve activity info. / 无法获取活动信息。</span>
       </p>`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px;">
      <h2 style="color:#1e2761; margin-bottom:2px;">Báo cáo Health Check — Hệ thống Kho NPL</h2>
      <p style="color:#888; font-size:13px; margin-top:0;">
        Daily Health Check Report — NPL Warehouse System<br/>
        每日健康检查报告 — 辅料仓库管理系统
      </p>
      <p>Thời gian chạy / Run time / 运行时间: ${new Date().toLocaleString('vi-VN')}</p>

      <h3>Kết quả kiểm tra luồng nghiệp vụ <span style="font-weight:normal; color:#888; font-size:13px;">/ Business Flow Test Results / 业务流程测试结果</span></h3>
      <table style="width:100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="padding:6px 10px; text-align:left;">Bước / Step / 步骤</th>
            <th style="padding:6px 10px; text-align:right;">Thời gian / Duration / 耗时</th>
            <th style="padding:6px 10px; text-align:left;">Lỗi (nếu có) / Error / 错误</th>
          </tr>
        </thead>
        <tbody>${stepsHtml}</tbody>
      </table>

      <h3 style="margin-top:20px;">Hoạt động người dùng hôm nay <span style="font-weight:normal; color:#888; font-size:13px;">/ Today's User Activity / 今日用户活动</span></h3>
      ${activityHtml}

      ${fatalError ? `<p style="color:#c00; margin-top:20px;"><strong>Lỗi dừng chuỗi kiểm tra / Fatal error / 严重错误:</strong> ${fatalError.message}</p>` : ''}

      <p style="color:#888; font-size:12px; margin-top:24px;">
        Email tự động từ script daily-healthcheck.js — không cần trả lời.<br/>
        Automated email — no reply needed. / 自动邮件，无需回复。
      </p>
    </div>
  `;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  await transporter.sendMail({
    from: `"Kho NPL Health Check" <${GMAIL_USER}>`,
    to: REPORT_TO_EMAIL,
    subject,
    html,
  });

  console.log('Da gui email bao cao.');
}

// ---------------------------------------------------------------------------
// Chay
// ---------------------------------------------------------------------------
main()
  .then(async (activityToday) => {
    await sendReportEmail(activityToday, null);
    process.exit(results.every((r) => r.status === 'PASS') ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('Chuoi kiem tra dung giua chung:', err.message);
    await sendReportEmail(null, err).catch((emailErr) => {
      console.error('Ca gui email cung loi:', emailErr.message);
    });
    process.exit(1);
  });
