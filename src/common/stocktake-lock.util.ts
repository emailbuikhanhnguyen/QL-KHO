import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Ham dung chung, duoc goi TRUOC khi bat ky module nao (Nhap kho, Xuat kho,
// Dieu chuyen kho) ghi StockLedgerEntry cho 1 kho cu the. Neu kho do dang
// bi khoa boi 1 phien kiem ke chua hoan tat, chan giao dich lai.
//
// Day la cach hien thuc hoa quyet dinh kien truc da chot tu dau du an:
// "StocktakeLock duoc enforce truoc moi thay doi ton kho".
export async function assertNoActiveStocktakeLock(
  tx: Prisma.TransactionClient,
  warehouseId: number,
): Promise<void> {
  const activeLock = await tx.stocktakeLock.findFirst({
    where: { warehouseId, releasedAt: null },
  });

  if (activeLock) {
    throw new ConflictException(
      `Kho #${warehouseId} dang duoc kiem ke (khoa tu ${activeLock.lockedAt.toISOString()}), ` +
        `khong the thuc hien giao dich luc nay. Vui long doi kiem ke hoan tat.`,
    );
  }
}
