import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthCheckService {
  constructor(private readonly prisma: PrismaService) {}

  // Kiem tra "co hoat dong nghiep vu THAT nao hom nay khong" — loai tru
  // giao dich do chinh tai khoan bot tu dong tao ra (system.healthcheck@sec.com),
  // de phan biet ro "nguoi that demo" voi "may tu kiem tra suc khoe he thong".
  async getActivityToday() {
    const systemUser = await this.prisma.user.findUnique({
      where: { email: 'system.healthcheck@sec.com' },
    });
    if (!systemUser) {
      throw new BadRequestException(
        'Chua co tai khoan he thong (system.healthcheck@sec.com). Chay prisma/seed-system-test.ts truoc.',
      );
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const excludeSystemUser = { not: systemUser.id };
    const createdTodayByRealUser = {
      createdAt: { gte: startOfToday },
      createdBy: excludeSystemUser,
    };

    const [goodsReceipts, qcInspections, issueRequests, warehouseTransfers, stocktakes] =
      await Promise.all([
        this.prisma.goodsReceipt.count({ where: createdTodayByRealUser }),
        this.prisma.qcInspection.count({ where: createdTodayByRealUser }),
        this.prisma.issueRequest.count({ where: createdTodayByRealUser }),
        this.prisma.warehouseTransfer.count({ where: createdTodayByRealUser }),
        // Stocktake dung startedBy thay vi createdBy
        this.prisma.stocktake.count({
          where: { createdAt: { gte: startOfToday }, startedBy: excludeSystemUser },
        }),
      ]);

    const totalRealActivity =
      goodsReceipts + qcInspections + issueRequests + warehouseTransfers + stocktakes;

    return {
      date: startOfToday.toISOString().slice(0, 10),
      hasRealActivity: totalRealActivity > 0,
      breakdown: {
        goodsReceipts,
        qcInspections,
        issueRequests,
        warehouseTransfers,
        stocktakes,
      },
      totalRealActivity,
    };
  }
}
