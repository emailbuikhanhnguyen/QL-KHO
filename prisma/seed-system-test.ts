import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Tao 1 kho + vat tu + nha cung cap RIENG BIET, chi de phuc vu tac vu tu
// dong kiem tra suc khoe he thong hang dem (health check). Co lap hoan
// toan voi 3 kho that (RM/Color Kitchen/FG) — Thanh xem bao cao binh
// thuong se KHONG BAO GIO thay du lieu test nay, vi no nam o kho rieng.
//
// Cach chay: npx ts-node prisma/seed-system-test.ts

const SYSTEM_ACCOUNT_EMAIL = 'system.healthcheck@sec.com';
const SYSTEM_ACCOUNT_PASSWORD = process.env.SYSTEM_HEALTHCHECK_PASSWORD;

async function main() {
  if (!SYSTEM_ACCOUNT_PASSWORD) {
    console.error(
      'LOI: chua co bien moi truong SYSTEM_HEALTHCHECK_PASSWORD. ' +
        'Vi du: SYSTEM_HEALTHCHECK_PASSWORD="mat-khau-manh" npx ts-node prisma/seed-system-test.ts',
    );
    process.exit(1);
  }

  console.log('Dang tao du lieu he thong cho health check tu dong...\n');

  // 1. Kho co lap (khong gan phong ban — giong pattern IN_TRANSIT da co)
  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'SYSTEM_TEST' },
    update: {},
    create: {
      code: 'SYSTEM_TEST',
      name: '[HE THONG] Kho kiem tra tu dong — khong dung cho nghiep vu that',
    },
  });
  console.log(`Kho: ${warehouse.code} (id=${warehouse.id})`);

  // 2. Nhom vat tu + vat tu rieng
  const itemGroup = await prisma.itemGroup.upsert({
    where: { code: 'HEALTHCHECK' },
    update: {},
    create: { code: 'HEALTHCHECK', name: '[HE THONG] Nhom vat tu kiem tra tu dong' },
  });

  const item = await prisma.item.upsert({
    where: { code: 'HEALTHCHECK-ITEM-01' },
    update: {},
    create: {
      code: 'HEALTHCHECK-ITEM-01',
      name: '[HE THONG] Vat tu kiem tra tu dong',
      unit: 'met',
      itemGroupId: itemGroup.id,
      minStock: 0,
      maxStock: 999999,
    },
  });
  console.log(`Item: ${item.code} (id=${item.id})`);

  // 3. Nha cung cap rieng
  const supplier = await prisma.supplier.upsert({
    where: { code: 'HEALTHCHECK-SUPPLIER' },
    update: {},
    create: { code: 'HEALTHCHECK-SUPPLIER', name: '[HE THONG] Nha cung cap kiem tra tu dong' },
  });
  console.log(`Supplier: ${supplier.code} (id=${supplier.id})`);

  // 4. Tai khoan bot rieng — KHONG dung chung voi tai khoan admin that, de
  // phan biet duoc "hoat dong nay la cua may tu dong hay cua nguoi that"
  // khi bao cao (loc theo createdBy).
  const rmDept = await prisma.department.findUniqueOrThrow({
    where: { code: 'RM_WAREHOUSE' },
  });

  const existing = await prisma.user.findUnique({ where: { email: SYSTEM_ACCOUNT_EMAIL } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(SYSTEM_ACCOUNT_PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        email: SYSTEM_ACCOUNT_EMAIL,
        passwordHash,
        fullName: 'He thong - Tai khoan kiem tra tu dong',
        role: Role.ADMIN,
        departmentId: rmDept.id,
      },
    });
    console.log(`Tai khoan bot: ${user.email} (id=${user.id})`);
  } else {
    console.log(`Tai khoan bot da ton tai: ${existing.email} (id=${existing.id})`);
  }

  console.log('\nHoan tat. Ghi lai cac ID nay de dien vao GitHub Secrets:');
  console.log(`  SYSTEM_TEST_WAREHOUSE_ID=${warehouse.id}`);
  console.log(`  HEALTHCHECK_ITEM_ID=${item.id}`);
  console.log(`  HEALTHCHECK_SUPPLIER_ID=${supplier.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
