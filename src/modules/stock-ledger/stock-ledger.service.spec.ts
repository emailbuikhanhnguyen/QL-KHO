import { Test, TestingModule } from '@nestjs/testing';
import { StockLedgerService } from './stock-ledger.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('StockLedgerService', () => {
  let service: StockLedgerService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      stockLedgerEntry: {
        groupBy: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      item: { findMany: jest.fn() },
      warehouse: { findMany: jest.fn() },
      lot: { findMany: jest.fn() },
      $transaction: jest.fn(async (arg: any) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg(prisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StockLedgerService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<StockLedgerService>(StockLedgerService);
    jest.clearAllMocks();
    // Mac dinh: danh sach rong cho cac ham enrichment — test nao can du lieu
    // cu the se tu ghi de bang mockResolvedValue rieng cua no.
    prisma.item.findMany.mockResolvedValue([]);
    prisma.warehouse.findMany.mockResolvedValue([]);
    prisma.lot.findMany.mockResolvedValue([]);
  });

  describe('getBalanceByItem', () => {
    it('loc bo cac dong ton = 0 theo mac dinh (khong truyen includeZero)', async () => {
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([
        { itemId: 1, warehouseId: 10, _sum: { quantity: 100 } },
        { itemId: 2, warehouseId: 10, _sum: { quantity: 0 } }, // da het, phai bi loc
      ]);
      prisma.item.findMany.mockResolvedValue([
        { id: 1, code: 'VT1', name: 'Vai A', unit: 'met' },
        { id: 2, code: 'VT2', name: 'Vai B', unit: 'met' },
      ]);
      prisma.warehouse.findMany.mockResolvedValue([{ id: 10, name: 'Kho RM' }]);

      const result = await service.getBalanceByItem({});

      expect(result).toHaveLength(1);
      expect(result[0].itemId).toBe(1);
      expect(result[0].balance).toBe(100);
    });

    it('giu lai dong ton = 0 khi includeZero = true', async () => {
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([
        { itemId: 2, warehouseId: 10, _sum: { quantity: 0 } },
      ]);
      prisma.item.findMany.mockResolvedValue([{ id: 2, code: 'VT2', name: 'Vai B', unit: 'met' }]);
      prisma.warehouse.findMany.mockResolvedValue([{ id: 10, name: 'Kho RM' }]);

      const result = await service.getBalanceByItem({ includeZero: true });
      expect(result).toHaveLength(1);
      expect(result[0].balance).toBe(0);
    });

    it('gan dung thong tin item/warehouse tuong ung (enrichment)', async () => {
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([
        { itemId: 1, warehouseId: 10, _sum: { quantity: 50 } },
      ]);
      prisma.item.findMany.mockResolvedValue([{ id: 1, code: 'VT1', name: 'Vai Kaki', unit: 'met' }]);
      prisma.warehouse.findMany.mockResolvedValue([{ id: 10, name: 'Kho nguyen phu lieu' }]);

      const result = await service.getBalanceByItem({});
      expect(result[0].item!.name).toBe('Vai Kaki');
      expect(result[0].warehouse!.name).toBe('Kho nguyen phu lieu');
    });

    it('ap dung dung filter itemId/warehouseId vao where cua groupBy', async () => {
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([]);
      await service.getBalanceByItem({ itemId: 5, warehouseId: 10 });

      expect(prisma.stockLedgerEntry.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { itemId: 5, warehouseId: 10 } }),
      );
    });
  });

  describe('getBalanceByLot', () => {
    it('gan dung thong tin lot kem theo (khac voi getBalanceByItem)', async () => {
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([
        { lotId: 500, itemId: 1, warehouseId: 10, _sum: { quantity: 30 } },
      ]);
      prisma.item.findMany.mockResolvedValue([{ id: 1, code: 'VT1', name: 'Vai A', unit: 'met' }]);
      prisma.warehouse.findMany.mockResolvedValue([{ id: 10, name: 'Kho RM' }]);
      prisma.lot.findMany.mockResolvedValue([{ id: 500, lotCode: 'LOT-001' }]);

      const result = await service.getBalanceByLot({});
      expect(result[0].lot!.lotCode).toBe('LOT-001');
    });
  });

  describe('getTransactions', () => {
    it('phan trang dung theo page/limit, gioi han limit toi da 200', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.getTransactions({ page: 1, limit: 500 }); // vuot gioi han

      expect(prisma.stockLedgerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }), // bi gioi han lai con 200
      );
    });

    it('ap dung filter khoang thoi gian dung', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.getTransactions({ fromDate: '2026-01-01', toDate: '2026-12-31' });

      expect(prisma.stockLedgerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-12-31'),
            },
          }),
        }),
      );
    });
  });
});
