import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { GoodsReceiptStatus, Role, StockMovementType } from '@prisma/client';
import { GoodsReceiptService } from './goods-receipt.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('GoodsReceiptService', () => {
  let service: GoodsReceiptService;
  let prisma: any;

  const rmDeptId = 1;
  const warehouseRM = { id: 10, departmentId: rmDeptId, deletedAt: null };
  const supplier = { id: 20, deletedAt: null };
  const item = { id: 30, deletedAt: null };

  const warehouseStaffRM = { id: 100, role: Role.WAREHOUSE_STAFF, departmentId: rmDeptId };
  const warehouseStaffOtherDept = { id: 101, role: Role.WAREHOUSE_STAFF, departmentId: 999 };
  const deptHeadRM = { id: 200, role: Role.DEPT_HEAD, departmentId: rmDeptId };
  const admin = { id: 1, role: Role.ADMIN, departmentId: rmDeptId };

  const draftReceipt = {
    id: 1,
    warehouseId: 10,
    supplierId: 20,
    status: GoodsReceiptStatus.DRAFT,
    deletedAt: null,
    lines: [{ id: 1000, itemId: 30, lotCode: 'LOT-A', quantity: 100, storageLocationId: null }],
  };

  beforeEach(async () => {
    prisma = {
      goodsReceipt: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      goodsReceiptLine: { deleteMany: jest.fn(), update: jest.fn() },
      warehouse: { findFirst: jest.fn() },
      supplier: { findFirst: jest.fn() },
      item: { findFirst: jest.fn() },
      storageLocation: { findFirst: jest.fn() },
      lot: { findFirst: jest.fn(), create: jest.fn() },
      stocktakeLock: { findFirst: jest.fn() },
      stockLedgerEntry: { create: jest.fn() },
      $transaction: jest.fn(async (arg: any) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg(prisma); // gia lap tx = chinh prisma mock
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GoodsReceiptService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<GoodsReceiptService>(GoodsReceiptService);
    jest.clearAllMocks();
    prisma.$transaction = jest.fn(async (arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg(prisma);
    });
    // Mac dinh: khong co kho nao dang bi khoa kiem ke — cac test lien quan
    // toi Stocktake se tu ghi de mock nay neu can.
    prisma.stocktakeLock.findFirst.mockResolvedValue(null);
  });

  describe('create', () => {
    const dto = {
      warehouseId: 10,
      supplierId: 20,
      lines: [{ itemId: 30, lotCode: 'LOT-A', quantity: 100 }],
    };

    it('tao phieu DRAFT thanh cong, tu sinh ma code sau khi co id', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);
      prisma.supplier.findFirst.mockResolvedValue(supplier);
      prisma.item.findFirst.mockResolvedValue(item);
      prisma.goodsReceipt.create.mockResolvedValue({ id: 5, lines: [] });
      prisma.goodsReceipt.update.mockResolvedValue({ id: 5, code: 'GRN-2026-000005', lines: [] });

      const result = await service.create(dto as any, warehouseStaffRM);

      expect(prisma.goodsReceipt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5 },
          data: { code: expect.stringMatching(/^GRN-\d{4}-000005$/) },
        }),
      );
      expect(result.code).toMatch(/^GRN-/);
    });

    it('nem ForbiddenException khi user khac phong ban voi kho', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);

      await expect(service.create(dto as any, warehouseStaffOtherDept)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('ADMIN duoc bo qua kiem tra phong ban', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);
      prisma.supplier.findFirst.mockResolvedValue(supplier);
      prisma.item.findFirst.mockResolvedValue(item);
      prisma.goodsReceipt.create.mockResolvedValue({ id: 6, lines: [] });
      prisma.goodsReceipt.update.mockResolvedValue({ id: 6, code: 'GRN-2026-000006', lines: [] });

      await expect(service.create(dto as any, admin)).resolves.toBeDefined();
    });

    it('nem BadRequestException khi item trong dong hang khong ton tai', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);
      prisma.supplier.findFirst.mockResolvedValue(supplier);
      prisma.item.findFirst.mockResolvedValue(null);

      await expect(service.create(dto as any, warehouseStaffRM)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('submit', () => {
    it('chuyen DRAFT -> PENDING_APPROVAL thanh cong', async () => {
      prisma.goodsReceipt.findFirst.mockResolvedValue(draftReceipt);
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);
      prisma.goodsReceipt.update.mockResolvedValue({
        ...draftReceipt,
        status: GoodsReceiptStatus.PENDING_APPROVAL,
      });

      const result = await service.submit(1, warehouseStaffRM);
      expect(result.status).toBe(GoodsReceiptStatus.PENDING_APPROVAL);
    });

    it('nem ConflictException khi phieu khong o trang thai DRAFT', async () => {
      prisma.goodsReceipt.findFirst.mockResolvedValue({
        ...draftReceipt,
        status: GoodsReceiptStatus.CONFIRMED,
      });
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);

      await expect(service.submit(1, warehouseStaffRM)).rejects.toThrow(ConflictException);
    });

    it('nem BadRequestException khi phieu khong co dong hang nao', async () => {
      prisma.goodsReceipt.findFirst.mockResolvedValue({ ...draftReceipt, lines: [] });
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);

      await expect(service.submit(1, warehouseStaffRM)).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve', () => {
    const pendingReceipt = { ...draftReceipt, status: GoodsReceiptStatus.PENDING_APPROVAL };

    it('duyet thanh cong: tao Lot moi + ghi StockLedgerEntry + chuyen CONFIRMED', async () => {
      prisma.goodsReceipt.findFirst.mockResolvedValue(pendingReceipt);
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);
      prisma.lot.findFirst.mockResolvedValue(null); // chua co lot -> se tao moi
      prisma.lot.create.mockResolvedValue({ id: 500 });
      prisma.goodsReceiptLine.update.mockResolvedValue({});
      prisma.stockLedgerEntry.create.mockResolvedValue({});
      prisma.goodsReceipt.update.mockResolvedValue({
        ...pendingReceipt,
        status: GoodsReceiptStatus.CONFIRMED,
      });

      const result = await service.approve(1, deptHeadRM);

      expect(prisma.lot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ itemId: 30, lotCode: 'LOT-A' }),
        }),
      );
      expect(prisma.stockLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lotId: 500,
            movementType: StockMovementType.RECEIPT,
            quantity: 100,
          }),
        }),
      );
      expect(result.status).toBe(GoodsReceiptStatus.CONFIRMED);
    });

    it('dung Lot da co san neu trung itemId+lotCode, khong tao trung', async () => {
      prisma.goodsReceipt.findFirst.mockResolvedValue(pendingReceipt);
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);
      prisma.lot.findFirst.mockResolvedValue({ id: 999 }); // da co san
      prisma.goodsReceiptLine.update.mockResolvedValue({});
      prisma.stockLedgerEntry.create.mockResolvedValue({});
      prisma.goodsReceipt.update.mockResolvedValue({
        ...pendingReceipt,
        status: GoodsReceiptStatus.CONFIRMED,
      });

      await service.approve(1, deptHeadRM);

      expect(prisma.lot.create).not.toHaveBeenCalled();
      expect(prisma.stockLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ lotId: 999 }) }),
      );
    });

    it('nem ForbiddenException khi WAREHOUSE_STAFF co gang duyet phieu', async () => {
      prisma.goodsReceipt.findFirst.mockResolvedValue(pendingReceipt);
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);

      await expect(service.approve(1, warehouseStaffRM)).rejects.toThrow(ForbiddenException);
    });

    it('nem ForbiddenException khi DEPT_HEAD khac phong ban co gang duyet', async () => {
      prisma.goodsReceipt.findFirst.mockResolvedValue(pendingReceipt);
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);

      const deptHeadOther = { id: 201, role: Role.DEPT_HEAD, departmentId: 999 };
      await expect(service.approve(1, deptHeadOther)).rejects.toThrow(ForbiddenException);
    });

    it('nem ConflictException khi phieu khong o trang thai PENDING_APPROVAL', async () => {
      prisma.goodsReceipt.findFirst.mockResolvedValue(draftReceipt); // van la DRAFT
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);

      await expect(service.approve(1, deptHeadRM)).rejects.toThrow(ConflictException);
    });
  });

  describe('reject', () => {
    it('chuyen PENDING_APPROVAL -> REJECTED kem ly do', async () => {
      const pendingReceipt = { ...draftReceipt, status: GoodsReceiptStatus.PENDING_APPROVAL };
      prisma.goodsReceipt.findFirst.mockResolvedValue(pendingReceipt);
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);
      prisma.goodsReceipt.update.mockResolvedValue({
        ...pendingReceipt,
        status: GoodsReceiptStatus.REJECTED,
        rejectedReason: 'Thieu hoa don',
      });

      const result = await service.reject(1, { reason: 'Thieu hoa don' }, deptHeadRM);
      expect(result.status).toBe(GoodsReceiptStatus.REJECTED);
      expect(result.rejectedReason).toBe('Thieu hoa don');
    });
  });

  describe('reopen', () => {
    it('chuyen REJECTED -> DRAFT, xoa ly do tu choi', async () => {
      const rejectedReceipt = {
        ...draftReceipt,
        status: GoodsReceiptStatus.REJECTED,
        rejectedReason: 'Thieu hoa don',
      };
      prisma.goodsReceipt.findFirst.mockResolvedValue(rejectedReceipt);
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);
      prisma.goodsReceipt.update.mockResolvedValue({
        ...rejectedReceipt,
        status: GoodsReceiptStatus.DRAFT,
        rejectedReason: null,
      });

      const result = await service.reopen(1, warehouseStaffRM);
      expect(result.status).toBe(GoodsReceiptStatus.DRAFT);
      expect(result.rejectedReason).toBeNull();
    });
  });

  describe('remove', () => {
    it('cho phep soft delete khi con DRAFT', async () => {
      prisma.goodsReceipt.findFirst.mockResolvedValue(draftReceipt);
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);
      prisma.goodsReceipt.update.mockResolvedValue({ ...draftReceipt, deletedAt: new Date() });

      await service.remove(1, warehouseStaffRM);
      expect(prisma.goodsReceipt.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
    });

    it('nem ConflictException khi phieu da CONFIRMED (khong cho xoa)', async () => {
      prisma.goodsReceipt.findFirst.mockResolvedValue({
        ...draftReceipt,
        status: GoodsReceiptStatus.CONFIRMED,
      });

      await expect(service.remove(1, warehouseStaffRM)).rejects.toThrow(ConflictException);
    });

    it('nem ForbiddenException khi user khac phong ban co gang xoa', async () => {
      prisma.goodsReceipt.findFirst.mockResolvedValue(draftReceipt);
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);

      await expect(service.remove(1, warehouseStaffOtherDept)).rejects.toThrow(ForbiddenException);
    });
  });
});
