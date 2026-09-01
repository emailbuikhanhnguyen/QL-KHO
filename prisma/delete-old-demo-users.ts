import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Script don dep 6 tai khoan demo CU (domain @congty.com) da tao truoc khi
// doi sang @sec.com. Chi xoa DUNG 6 email liet ke ro rang duoi day — khong
// dung dieu kien "chua @congty.com" chung chung de tranh xoa nham du lieu
// khac (VD: admin@congty.com KHONG nam trong danh sach nay, se khong bi dong).
//
// Cach chay: npx ts-node prisma/delete-old-demo-users.ts

const OLD_DEMO_EMAILS = [
  'thukho.rm@congty.com',
  'thukho.fg@congty.com',
  'qc.manager@congty.com',
  'truongphong.pmc@congty.com',
  'nhanvien.pmc@congty.com',
  'bod@congty.com',
];

async function main() {
  console.log('Dang xoa cac tai khoan demo cu (@congty.com)...\n');

  for (const email of OLD_DEMO_EMAILS) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      console.log(`  Khong ton tai, bo qua: ${email}`);
      continue;
    }

    await prisma.user.delete({ where: { email } });
    console.log(`  Da xoa: ${email}`);
  }

  console.log('\nHoan tat don dep.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
