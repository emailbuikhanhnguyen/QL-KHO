import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Script rieng, KHONG gop vao seed.ts chinh — chi chay khi can chuan bi
// demo/UAT, tranh viec cac tai khoan demo nay xuat hien trong moi truong
// that (Pilot/Production) sau nay.
//
// Cach chay: npx ts-node prisma/seed-demo-users.ts

const DEMO_PASSWORD = 'Demo@123456';

const DEMO_USERS = [
  {
    email: 'kho.rm@sec.com',
    fullName: 'Nguyen Van Kho',
    role: Role.WAREHOUSE_STAFF,
    deptCode: 'RM_WAREHOUSE',
  },
  {
    email: 'kho.fg@sec.com',
    fullName: 'Tran Thi Thanh',
    role: Role.WAREHOUSE_STAFF,
    deptCode: 'FG_WAREHOUSE',
  },
  {
    email: 'kho.vt@sec.com',
    fullName: 'Do Van Vat Tu',
    role: Role.WAREHOUSE_STAFF,
    deptCode: 'TOOLS_WAREHOUSE',
  },
  {
    email: 'qc@sec.com',
    fullName: 'Le Van QC',
    role: Role.QC_MANAGER,
    deptCode: 'QA',
  },
  {
    email: 'head.pmc@sec.com',
    fullName: 'Pham Thi Truong',
    role: Role.DEPT_HEAD,
    deptCode: 'PMC',
  },
  {
    email: 'nv.pmc@sec.com',
    fullName: 'Hoang Van Nhan',
    role: Role.REQUESTER,
    deptCode: 'PMC',
  },
  {
    email: 'bod@sec.com',
    fullName: 'Ban Giam Doc',
    role: Role.BOD,
    deptCode: 'BOD',
  },
];

async function main() {
  console.log('Dang tao tai khoan demo cho day du cac cap...\n');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of DEMO_USERS) {
    const dept = await prisma.department.findUnique({ where: { code: u.deptCode } });
    if (!dept) {
      console.error(`  LOI: khong tim thay Department code='${u.deptCode}'. Bo qua ${u.email}.`);
      continue;
    }

    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`  Da ton tai, bo qua: ${u.email}`);
      continue;
    }

    await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        departmentId: dept.id,
      },
    });
    console.log(`  Da tao: ${u.email} — ${u.role} (${u.fullName})`);
  }

  console.log(`\nHoan tat. Mat khau chung cho tat ca tai khoan demo: ${DEMO_PASSWORD}`);
  console.log('LUU Y: day la tai khoan DEMO, doi mat khau hoac xoa truoc khi dua vao Pilot/Production that.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
