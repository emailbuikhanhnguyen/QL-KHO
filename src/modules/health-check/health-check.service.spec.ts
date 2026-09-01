import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { HealthCheckService } from './health-check.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('HealthCheckService', () => {
  let service: HealthCheckService;
  let prisma: any;

  const systemUser = { id: 999, email: 'system.healthcheck@sec.com' };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      goodsReceipt: { count: jest.fn() },
      qcInspection: { count: jest.fn() },
      issueRequest: { count: jest.fn() },
      warehouseTransfer: { count: jest.fn() },
      stocktake: { count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthCheckService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<HealthCheckService>(HealthCheckService);
    jest.clearAllMocks();
  });

  it('nem BadRequestException khi chua co tai khoan he thong', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getActivityToday()).rejects.toThrow(BadRequestException);
  });

  it('bao cao KHONG co hoat dong that khi tat ca deu = 0', async () => {
    prisma.user.findUnique.mockResolvedValue(systemUser);
    prisma.goodsReceipt.count.mockResolvedValue(0);
    prisma.qcInspection.count.mockResolvedValue(0);
    prisma.issueRequest.count.mockResolvedValue(0);
    prisma.warehouseTransfer.count.mockResolvedValue(0);
    prisma.stocktake.count.mockResolvedValue(0);

    const result = await service.getActivityToday();

    expect(result.hasRealActivity).toBe(false);
    expect(result.totalRealActivity).toBe(0);
  });

  it('bao cao CO hoat dong that khi it nhat 1 loai > 0', async () => {
    prisma.user.findUnique.mockResolvedValue(systemUser);
    prisma.goodsReceipt.count.mockResolvedValue(2);
    prisma.qcInspection.count.mockResolvedValue(0);
    prisma.issueRequest.count.mockResolvedValue(1);
    prisma.warehouseTransfer.count.mockResolvedValue(0);
    prisma.stocktake.count.mockResolvedValue(0);

    const result = await service.getActivityToday();

    expect(result.hasRealActivity).toBe(true);
    expect(result.totalRealActivity).toBe(3);
    expect(result.breakdown.goodsReceipts).toBe(2);
    expect(result.breakdown.issueRequests).toBe(1);
  });

  it('loai tru dung tai khoan he thong ra khoi dieu kien dem (createdBy != systemUser.id)', async () => {
    prisma.user.findUnique.mockResolvedValue(systemUser);
    prisma.goodsReceipt.count.mockResolvedValue(0);
    prisma.qcInspection.count.mockResolvedValue(0);
    prisma.issueRequest.count.mockResolvedValue(0);
    prisma.warehouseTransfer.count.mockResolvedValue(0);
    prisma.stocktake.count.mockResolvedValue(0);

    await service.getActivityToday();

    expect(prisma.goodsReceipt.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdBy: { not: systemUser.id } }),
      }),
    );
    expect(prisma.stocktake.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ startedBy: { not: systemUser.id } }),
      }),
    );
  });
});
