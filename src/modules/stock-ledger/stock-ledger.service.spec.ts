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
        expect.objectContaining({ where: expect.objectContaining({ itemId: 5, warehouseId: 10 }) }),
      );
    });

    it('luon loai tru du lieu he thong (HEALTHCHECK/SYSTEM_TEST/IN_TRANSIT) khoi where', async () => {
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([]);
      await service.getBalanceByItem({});

      expect(prisma.stockLedgerEntry.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            item: { code: { not: { startsWith: 'HEALTHCHECK' } } },
            warehouse: { code: { notIn: ['SYSTEM_TEST', 'IN_TRANSIT'] } },
          }),
        }),
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

  describe('getLowStockAlerts', () => {
    it('canh bao dung vat tu co tong ton (moi kho cong lai) duoi minStock', async () => {
      prisma.item.findMany.mockResolvedValue([
        { id: 1, code: 'VAI-001', name: 'Vai kaki', unit: 'met', minStock: 100, maxStock: 1000 },
      ]);
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([{ itemId: 1, _sum: { quantity: 50 } }]);

      const result = await service.getLowStockAlerts();

      expect(result.count).toBe(1);
      expect(result.alerts[0]).toMatchObject({ itemId: 1, totalBalance: 50, minStock: 100, shortage: 50 });
    });

    it('KHONG canh bao vat tu co tong ton >= minStock', async () => {
      prisma.item.findMany.mockResolvedValue([
        { id: 2, code: 'VAI-002', name: 'Vai kate', unit: 'met', minStock: 100, maxStock: 1000 },
      ]);
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([{ itemId: 2, _sum: { quantity: 150 } }]);

      const result = await service.getLowStockAlerts();

      expect(result.count).toBe(0);
    });

    it('KHONG canh bao vat tu co minStock = 0 (nghia la khong dat han muc)', async () => {
      prisma.item.findMany.mockResolvedValue([
        { id: 3, code: 'VAI-003', name: 'Vai chua dat han muc', unit: 'met', minStock: 0, maxStock: 0 },
      ]);
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([]); // chua tung co giao dich, ton = 0

      const result = await service.getLowStockAlerts();

      expect(result.count).toBe(0);
    });

    it('VAN canh bao vat tu MOI TAO chua tung co giao dich nao (ton thuc te = 0)', async () => {
      // Day la truong hop quan trong nhat — vat tu khong xuat hien trong
      // groupBy (vi chua co StockLedgerEntry nao), nhung ton thuc te = 0
      // van phai duoc tinh dung va canh bao neu minStock > 0.
      prisma.item.findMany.mockResolvedValue([
        { id: 4, code: 'VAI-MOI', name: 'Vai vua tao, chua nhap lan nao', unit: 'met', minStock: 50, maxStock: 500 },
      ]);
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([]); // khong co dong nao cho item nay

      const result = await service.getLowStockAlerts();

      expect(result.count).toBe(1);
      expect(result.alerts[0]).toMatchObject({ itemId: 4, totalBalance: 0, minStock: 50, shortage: 50 });
    });

    it('sap xep dung theo muc thieu hut giam dan (thieu nhieu nhat len dau)', async () => {
      prisma.item.findMany.mockResolvedValue([
        { id: 5, code: 'A', name: 'A', unit: 'cai', minStock: 100, maxStock: 1000 },
        { id: 6, code: 'B', name: 'B', unit: 'cai', minStock: 100, maxStock: 1000 },
      ]);
      prisma.stockLedgerEntry.groupBy.mockResolvedValue([
        { itemId: 5, _sum: { quantity: 90 } }, // thieu 10
        { itemId: 6, _sum: { quantity: 20 } }, // thieu 80
      ]);

      const result = await service.getLowStockAlerts();

      expect(result.alerts.map((a) => a.itemId)).toEqual([6, 5]); // B (thieu nhieu hon) len truoc
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
