import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StocktakeStatus, Role, StockMovementType } from '@prisma/client';
import { StocktakeService } from './stocktake.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StockLedgerService } from '../stock-ledger/stock-ledger.service';

describe('StocktakeService', () => {
  let service: StocktakeService;
  let prisma: any;
  let stockLedgerService: any;

  const rmDeptId = 1;
  const rmWarehouseZeroTolerance = {
    id: 10,
    name: 'Kho RM',
    departmentId: rmDeptId,
    stocktakeTolerancePercent: 0,
    deletedAt: null,
  };
  const colorKitchenWithTolerance = {
    id: 20,
    name: 'Color Kitchen',
    departmentId: 2,
    stocktakeTolerancePercent: 5, // gia dinh 5% cho vi du
    deletedAt: null,
  };

  const rmStaff = { id: 100, role: Role.WAREHOUSE_STAFF, departmentId: rmDeptId };
  const admin = { id: 1, role: Role.ADMIN, departmentId: rmDeptId };

  const inProgressStocktake = {
    id: 1,
    code: 'STK-2026-000001',
    warehouseId: 10,
    status: StocktakeStatus.IN_PROGRESS,
    lines: [
      { id: 1000, lotId: 500, systemQuantity: 100, countedQuantity: null },
      { id: 1001, lotId: 501, systemQuantity: 50, countedQuantity: null },
    ],
  };

  beforeEach(async () => {
    prisma = {
      stocktake: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      stocktakeLine: { update: jest.fn(), findFirst: jest.fn() },
      stocktakeLock: { create: jest.fn(), update: jest.fn() },
      warehouse: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
      lot: { findUniqueOrThrow: jest.fn() },
      stockLedgerEntry: { create: jest.fn() },
      $transaction: jest.fn(async (arg: any) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg(prisma);
      }),
    };

    stockLedgerService = { getBalanceByLot: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StocktakeService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockLedgerService, useValue: stockLedgerService },
      ],
    }).compile();

    service = module.get<StocktakeService>(StocktakeService);
    jest.clearAllMocks();
    prisma.$transaction = jest.fn(async (arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg(prisma);
    });
  });

  describe('findActiveLineByLot', () => {
    it('tim dung dong khi lo nam trong phien kiem ke dang mo', async () => {
      const fakeLine = {
        id: 1000,
        lotId: 500,
        stocktakeId: 1,
        systemQuantity: 100,
        countedQuantity: null,
        lot: { lotCode: 'LOT-A', item: { name: 'Vai Kaki' } },
      };
      prisma.stocktakeLine.findFirst.mockResolvedValue(fakeLine);

      const result = await service.findActiveLineByLot(500);

      expect(result).toEqual(fakeLine);
      expect(prisma.stocktakeLine.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            lotId: 500,
            stocktake: { status: StocktakeStatus.IN_PROGRESS },
          }),
        }),
      );
    });

    it('nem NotFoundException khi lo khong nam trong phien kiem ke nao dang mo', async () => {
      prisma.stocktakeLine.findFirst.mockResolvedValue(null);

      await expect(service.findActiveLineByLot(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('start', () => {
    it('tao stocktake + lock thanh cong, chup nhanh dung so luong ton hien tai', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(rmWarehouseZeroTolerance);
      prisma.stocktake.findFirst.mockResolvedValue(null); // chua co phien nao dang chay
      stockLedgerService.getBalanceByLot.mockResolvedValue([
        { lotId: 500, balance: 100 },
        { lotId: 501, balance: 50 },
      ]);
      prisma.stocktake.create.mockResolvedValue({ id: 1, lines: [] });
      prisma.stocktakeLock.create.mockResolvedValue({});
      prisma.stocktake.update.mockResolvedValue({ id: 1, code: 'STK-2026-000001', lines: [] });

      const result = await service.start({ warehouseId: 10 } as any, rmStaff);

      expect(result.code).toMatch(/^STK-/);
      expect(prisma.stocktake.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lines: { create: [{ lotId: 500, systemQuantity: 100 }, { lotId: 501, systemQuantity: 50 }] },
          }),
        }),
      );
      expect(prisma.stocktakeLock.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stocktakeId: 1, warehouseId: 10 }) }),
      );
    });

    it('nem ConflictException khi kho da co phien kiem ke dang chay', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(rmWarehouseZeroTolerance);
      prisma.stocktake.findFirst.mockResolvedValue({ id: 99, code: 'STK-2026-000099' });

      await expect(service.start({ warehouseId: 10 } as any, rmStaff)).rejects.toThrow(
        ConflictException,
      );
    });

    it('nem BadRequestException khi kho khong co ton nao de kiem ke', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(rmWarehouseZeroTolerance);
      prisma.stocktake.findFirst.mockResolvedValue(null);
      stockLedgerService.getBalanceByLot.mockResolvedValue([]);

      await expect(service.start({ warehouseId: 10 } as any, rmStaff)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateCount', () => {
    it('cap nhat so dem thanh cong khi con IN_PROGRESS', async () => {
      prisma.stocktake.findFirst.mockResolvedValue(inProgressStocktake);
      prisma.warehouse.findFirst.mockResolvedValue(rmWarehouseZeroTolerance);
      prisma.stocktakeLine.update.mockResolvedValue({});

      await service.updateCount(1, 1000, { countedQuantity: 95 } as any, rmStaff);

      expect(prisma.stocktakeLine.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ countedQuantity: 95 }) }),
      );
    });

    it('nem ConflictException khi phien da COMPLETED', async () => {
      prisma.stocktake.findFirst.mockResolvedValue({
        ...inProgressStocktake,
        status: StocktakeStatus.COMPLETED,
      });

      await expect(
        service.updateCount(1, 1000, { countedQuantity: 95 } as any, rmStaff),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('complete', () => {
    it('nem BadRequestException khi con dong chua dem', async () => {
      prisma.stocktake.findFirst.mockResolvedValue(inProgressStocktake); // ca 2 dong countedQuantity=null
      prisma.warehouse.findFirst.mockResolvedValue(rmWarehouseZeroTolerance);

      await expect(service.complete(1, rmStaff)).rejects.toThrow(BadRequestException);
    });

    it('hoan tat thanh cong khi khop hoan toan (khong chenh lech)', async () => {
      const fullyCounted = {
        ...inProgressStocktake,
        lines: [
          { id: 1000, lotId: 500, systemQuantity: 100, countedQuantity: 100 },
          { id: 1001, lotId: 501, systemQuantity: 50, countedQuantity: 50 },
        ],
      };
      prisma.stocktake.findFirst.mockResolvedValue(fullyCounted);
      prisma.warehouse.findFirst.mockResolvedValue(rmWarehouseZeroTolerance);
      prisma.warehouse.findUniqueOrThrow.mockResolvedValue(rmWarehouseZeroTolerance);
      prisma.stocktakeLine.update.mockResolvedValue({});
      prisma.stocktakeLock.update.mockResolvedValue({});
      prisma.stocktake.update.mockResolvedValue({
        ...fullyCounted,
        status: StocktakeStatus.COMPLETED,
      });

      const result = await service.complete(1, rmStaff);

      expect(prisma.stockLedgerEntry.create).not.toHaveBeenCalled(); // khong co chenh lech -> khong ghi dieu chinh
      expect(result.status).toBe(StocktakeStatus.COMPLETED);
    });

    it('CHAN hoan tat khi chenh lech vuot dung sai 0% cua kho RM', async () => {
      const withVariance = {
        ...inProgressStocktake,
        lines: [
          { id: 1000, lotId: 500, systemQuantity: 100, countedQuantity: 95 }, // thieu 5, kho RM dung sai 0%
        ],
      };
      prisma.stocktake.findFirst.mockResolvedValue(withVariance);
      prisma.warehouse.findFirst.mockResolvedValue(rmWarehouseZeroTolerance);
      prisma.warehouse.findUniqueOrThrow.mockResolvedValue(rmWarehouseZeroTolerance);

      await expect(service.complete(1, rmStaff)).rejects.toThrow(ConflictException);
      expect(prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
    });

    it('CHO PHEP hoan tat khi chenh lech nam trong dung sai cua Color Kitchen', async () => {
      const withSmallVariance = {
        ...inProgressStocktake,
        warehouseId: 20,
        lines: [
          { id: 1000, lotId: 500, systemQuantity: 100, countedQuantity: 97 }, // lech 3%, duoi nguong 5%
        ],
      };
      prisma.stocktake.findFirst.mockResolvedValue(withSmallVariance);
      prisma.warehouse.findFirst.mockResolvedValue(colorKitchenWithTolerance);
      prisma.warehouse.findUniqueOrThrow.mockResolvedValue(colorKitchenWithTolerance);
      prisma.lot.findUniqueOrThrow.mockResolvedValue({ id: 500, itemId: 30 });
      prisma.stocktakeLine.update.mockResolvedValue({});
      prisma.stockLedgerEntry.create.mockResolvedValue({});
      prisma.stocktakeLock.update.mockResolvedValue({});
      prisma.stocktake.update.mockResolvedValue({
        ...withSmallVariance,
        status: StocktakeStatus.COMPLETED,
      });

      const result = await service.complete(1, { id: 200, role: Role.WAREHOUSE_STAFF, departmentId: 2 });

      expect(prisma.stockLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            movementType: StockMovementType.ADJUSTMENT,
            quantity: -3, // 97 - 100 = -3
          }),
        }),
      );
      expect(result.status).toBe(StocktakeStatus.COMPLETED);
    });

    it('giai phong StocktakeLock khi hoan tat thanh cong', async () => {
      const fullyCounted = {
        ...inProgressStocktake,
        lines: [{ id: 1000, lotId: 500, systemQuantity: 100, countedQuantity: 100 }],
      };
      prisma.stocktake.findFirst.mockResolvedValue(fullyCounted);
      prisma.warehouse.findFirst.mockResolvedValue(rmWarehouseZeroTolerance);
      prisma.warehouse.findUniqueOrThrow.mockResolvedValue(rmWarehouseZeroTolerance);
      prisma.stocktakeLine.update.mockResolvedValue({});
      prisma.stocktakeLock.update.mockResolvedValue({});
      prisma.stocktake.update.mockResolvedValue({ ...fullyCounted, status: StocktakeStatus.COMPLETED });

      await service.complete(1, rmStaff);

      expect(prisma.stocktakeLock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stocktakeId: 1 },
          data: expect.objectContaining({ releasedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('forceComplete', () => {
    it('nem ForbiddenException khi khong phai ADMIN', async () => {
      await expect(
        service.forceComplete(1, { reason: 'Da xac minh thu cong' }, rmStaff),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN ghi de duoc du vuot dung sai, luu lai ly do', async () => {
      const withVariance = {
        ...inProgressStocktake,
        lines: [{ id: 1000, lotId: 500, systemQuantity: 100, countedQuantity: 80 }], // lech 20%
      };
      prisma.stocktake.findFirst.mockResolvedValue(withVariance);
      prisma.warehouse.findUniqueOrThrow.mockResolvedValue(rmWarehouseZeroTolerance);
      prisma.lot.findUniqueOrThrow.mockResolvedValue({ id: 500, itemId: 30 });
      prisma.stocktakeLine.update.mockResolvedValue({});
      prisma.stockLedgerEntry.create.mockResolvedValue({});
      prisma.stocktakeLock.update.mockResolvedValue({});
      prisma.stocktake.update.mockResolvedValue({
        ...withVariance,
        status: StocktakeStatus.COMPLETED,
        forceCompletedReason: 'Da xac minh thu cong',
      });

      const result = await service.forceComplete(
        1,
        { reason: 'Da xac minh thu cong' },
        admin,
      );

      expect(prisma.stockLedgerEntry.create).toHaveBeenCalled(); // van ghi dieu chinh du vuot dung sai
      expect(result.forceCompletedReason).toBe('Da xac minh thu cong');
    });
  });

  describe('cancel', () => {
    it('huy thanh cong, KHONG ghi StockLedgerEntry nao, giai phong lock', async () => {
      prisma.stocktake.findFirst.mockResolvedValue(inProgressStocktake);
      prisma.warehouse.findFirst.mockResolvedValue(rmWarehouseZeroTolerance);
      prisma.stocktakeLock.update.mockResolvedValue({});
      prisma.stocktake.update.mockResolvedValue({
        ...inProgressStocktake,
        status: StocktakeStatus.CANCELLED,
      });

      const result = await service.cancel(1, rmStaff);

      expect(prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
      expect(result.status).toBe(StocktakeStatus.CANCELLED);
    });
  });
});
