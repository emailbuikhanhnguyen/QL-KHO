import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Danh sach phong ban mac dinh, dua tren phan hoi cua Sep (cau hoi 1, 17, 22):
// 3 kho/bo phan co du lieu rieng + cac phong ban chi tao phieu yeu cau xuat kho.
const DEPARTMENTS = [
  { code: 'RM_WAREHOUSE', name: 'Kho nguyen phu lieu (RM)' },
  { code: 'COLOR_KITCHEN', name: 'Phong pha mau (Color Kitchen)' },
  { code: 'FG_WAREHOUSE', name: 'Kho thanh pham (Finished Goods)' },
  { code: 'PMC', name: 'Phong PMC' },
  { code: 'CS', name: 'Phong CS' },
  { code: 'FD', name: 'Phong FD' },
  { code: 'QA', name: 'Phong QA' },
  { code: 'BOD', name: 'Ban Giam Doc (BOD)' },
];

async function main() {
  console.log('Seeding departments...');
  for (const dept of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: {},
      create: dept,
    });
  }

  const rmWarehouse = await prisma.department.findUniqueOrThrow({
    where: { code: 'RM_WAREHOUSE' },
  });

  console.log('Seeding warehouses...');
  const WAREHOUSES = [
    { code: 'RM_WAREHOUSE', name: 'Kho nguyen phu lieu (RM)', deptCode: 'RM_WAREHOUSE' },
    { code: 'COLOR_KITCHEN', name: 'Phong pha mau (Color Kitchen)', deptCode: 'COLOR_KITCHEN' },
    { code: 'FG_WAREHOUSE', name: 'Kho thanh pham (Finished Goods)', deptCode: 'FG_WAREHOUSE' },
  ];
  for (const wh of WAREHOUSES) {
    const dept = await prisma.department.findUniqueOrThrow({ where: { code: wh.deptCode } });
    await prisma.warehouse.upsert({
      where: { code: wh.code },
      update: {},
      create: { code: wh.code, name: wh.name, departmentId: dept.id },
    });
  }

  // Kho ao dung lam diem trung gian khi dieu chuyen giua 2 kho that —
  // dam bao khong co ton kho nao "bien mat" giua luc xuat va luc nhan.
  // Khong gan departmentId (khong thuoc phong ban nao quan ly rieng).
  await prisma.warehouse.upsert({
    where: { code: 'IN_TRANSIT' },
    update: {},
    create: { code: 'IN_TRANSIT', name: 'Kho trung chuyen (hang dang van chuyen)' },
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@congty.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    console.log(`Tao tai khoan admin mac dinh: ${adminEmail}`);
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        fullName: 'Quan tri he thong',
        role: Role.ADMIN,
        departmentId: rmWarehouse.id,
      },
    });
    console.log(`  -> Mat khau mac dinh: ${adminPassword} (DOI NGAY sau lan dang nhap dau tien)`);
  } else {
    console.log('Tai khoan admin da ton tai, bo qua.');
  }

  console.log('Seed hoan tat.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
