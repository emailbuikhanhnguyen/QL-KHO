import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Cach dung:
//   npm run admin:set-password -- admin@congty.com MatKhauMoiCuaBan123

async function main() {
  const [, , email, newPassword] = process.argv;

  if (!email || !newPassword) {
    console.error('Thieu tham so. Cach dung:');
    console.error('  npm run admin:set-password -- <email> <mat_khau_moi>');
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error('Mat khau moi phai co it nhat 8 ky tu.');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Khong tim thay user voi email '${email}'.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { email },
    data: { passwordHash },
  });

  console.log(`Da doi mat khau thanh cong cho '${email}'.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });