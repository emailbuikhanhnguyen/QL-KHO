import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { WarehouseTransferStatus, Role, StockMovementType } from '@prisma/client';
import { WarehouseTransferService } from './warehouse-transfer.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('WarehouseTransferService', () => {
  let service: WarehouseTransferService;
  let prisma: any;

  const rmDeptId = 1;
  const fgDeptId = 2;
  const rmWarehouse = { id: 10, departmentId: rmDeptId, deletedAt: null };
  const fgWarehouse = { id: 20, departmentId: fgDeptId, deletedAt: null };
  const inTransitWarehouse = { id: 99, departmentId: null, code: 'IN_TRANSIT', deletedAt: null };

  const rmStaff = { id: 100, role: Role.WAREHOUSE_STAFF, departmentId: rmDeptId };
  const fgStaff = { id: 200, role: Role.WAREHOUSE_STAFF, departmentId: fgDeptId };
  const admin = { id: 1, role: Role.ADMIN, departmentId: rmDeptId };

  const draftTransfer = {
    id: 1,
    sourceWarehouseId: 10,
    destWarehouseId: 20,
    status: WarehouseTransferStatus.DRAFT,
    deletedAt: null,
    lines: [{ id: 1000, lotId: 500, quantity: 50 }],
  };

  beforeEach(async () => {
    prisma = {
      warehouseTransfer: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      warehouseTransferLine: { deleteMany: jest.fn() },
      warehouse: { findFirst: jest.fn() },
      lot: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
      stockLedgerEntry: { create: jest.fn(), aggregate: jest.fn() },
      stocktakeLock: { findFirst: jest.fn() },
      $transaction: jest.fn(async (arg: any) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg(prisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WarehouseTransferService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<WarehouseTransferService>(WarehouseTransferService);
    jest.clearAllMocks();
    prisma.$transaction = jest.fn(async (arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg(prisma);
    });
    prisma.stocktakeLock.findFirst.mockResolvedValue(null);
  });

  describe('create', () => {
    it('nem BadRequestException khi kho nguon = kho dich', async () => {
      await expect(
        service.create(
          { sourceWarehouseId: 10, destWarehouseId: 10, lines: [{ lotId: 500, quantity: 10 }] } as any,
          rmStaff,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('tao phieu thanh cong khi kho khac nhau va staff dung phong ban nguon', async () => {
      prisma.warehouse.findFirst.mockImplementation(({ where }: any) => {
        if (where.id === 10) return Promise.resolve(rmWarehouse);
        if (where.id === 20) return Promise.resolve(fgWarehouse);
        return Promise.resolve(null);
      });
      prisma.lot.findFirst.mockResolvedValue({ id: 500 });
      prisma.warehouseTransfer.create.mockResolvedValue({ id: 5, lines: [] });
      prisma.warehouseTransfer.update.mockResolvedValue({ id: 5, code: 'TRF-2026-000005', lines: [] });

      const result = await service.create(
        { sourceWarehouseId: 10, destWarehouseId: 20, lines: [{ lotId: 500, quantity: 10 }] } as any,
        rmStaff,
      );
      expect(result.code).toMatch(/^TRF-/);
    });

    it('nem ForbiddenException khi staff khong thuoc phong ban kho nguon', async () => {
      prisma.warehouse.findFirst.mockImplementation(({ where }: any) => {
        if (where.id === 10) return Promise.resolve(rmWarehouse);
        return Promise.resolve(fgWarehouse);
      });

      await expect(
        service.create(
          { sourceWarehouseId: 10, destWarehouseId: 20, lines: [{ lotId: 500, quantity: 10 }] } as any,
          fgStaff, // staff cua FG nhung nguon la RM
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ship — kho nguon xac nhan xuat', () => {
    it('thanh cong: tao 2 StockLedgerEntry (tru kho nguon, cong kho trung chuyen)', async () => {
      prisma.warehouseTransfer.findFirst.mockResolvedValue(draftTransfer);
      prisma.warehouse.findFirst.mockImplementation(({ where }: any) => {
        if (where.id === 10) return Promise.resolve(rmWarehouse);
        if (where.code === 'IN_TRANSIT') return Promise.resolve(inTransitWarehouse);
        return Promise.resolve(null);
      });
      prisma.stockLedgerEntry.aggregate.mockResolvedValue({ _sum: { quantity: 100 } }); // du ton
      prisma.lot.findUniqueOrThrow.mockResolvedValue({ id: 500, itemId: 30 });
      prisma.stockLedgerEntry.create.mockResolvedValue({});
      prisma.warehouseTransfer.update.mockResolvedValue({
        ...draftTransfer,
        status: WarehouseTransferStatus.SHIPPED,
      });

      const result = await service.ship(1, rmStaff);

      expect(prisma.stockLedgerEntry.create).toHaveBeenCalledTimes(2);
      expect(prisma.stockLedgerEntry.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            warehouseId: 10,
            movementType: StockMovementType.TRANSFER_OUT,
            quantity: -50,
          }),
        }),
      );
      expect(prisma.stockLedgerEntry.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            warehouseId: 99,
            movementType: StockMovementType.TRANSFER_IN,
            quantity: 50,
          }),
        }),
      );
      expect(result.status).toBe(WarehouseTransferStatus.SHIPPED);
    });

    it('nem BadRequestException khi khong du ton trong kho nguon', async () => {
      prisma.warehouseTransfer.findFirst.mockResolvedValue(draftTransfer);
      prisma.warehouse.findFirst.mockImplementation(({ where }: any) => {
        if (where.id === 10) return Promise.resolve(rmWarehouse);
        if (where.code === 'IN_TRANSIT') return Promise.resolve(inTransitWarehouse);
        return Promise.resolve(null);
      });
      prisma.stockLedgerEntry.aggregate.mockResolvedValue({ _sum: { quantity: 10 } }); // chi co 10, can 50

      await expect(service.ship(1, rmStaff)).rejects.toThrow(BadRequestException);
      expect(prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
    });

    it('nem ForbiddenException khi staff KHO DICH (khong phai kho nguon) co gang ship', async () => {
      prisma.warehouseTransfer.findFirst.mockResolvedValue(draftTransfer);
      prisma.warehouse.findFirst.mockResolvedValue(rmWarehouse);

      await expect(service.ship(1, fgStaff)).rejects.toThrow(ForbiddenException);
    });

    it('nem ConflictException khi phieu khong o DRAFT', async () => {
      prisma.warehouseTransfer.findFirst.mockResolvedValue({
        ...draftTransfer,
        status: WarehouseTransferStatus.SHIPPED,
      });

      await expect(service.ship(1, rmStaff)).rejects.toThrow(ConflictException);
    });
  });

  describe('receive — kho dich xac nhan nhan', () => {
    const shippedTransfer = { ...draftTransfer, status: WarehouseTransferStatus.SHIPPED };

    it('thanh cong: tao 2 StockLedgerEntry (tru trung chuyen, cong kho dich)', async () => {
      prisma.warehouseTransfer.findFirst.mockResolvedValue(shippedTransfer);
      prisma.warehouse.findFirst.mockImplementation(({ where }: any) => {
        if (where.id === 20) return Promise.resolve(fgWarehouse);
        if (where.code === 'IN_TRANSIT') return Promise.resolve(inTransitWarehouse);
        return Promise.resolve(null);
      });
      prisma.lot.findUniqueOrThrow.mockResolvedValue({ id: 500, itemId: 30 });
      prisma.stockLedgerEntry.create.mockResolvedValue({});
      prisma.warehouseTransfer.update.mockResolvedValue({
        ...shippedTransfer,
        status: WarehouseTransferStatus.RECEIVED,
      });

      const result = await service.receive(1, fgStaff);

      expect(prisma.stockLedgerEntry.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({ warehouseId: 99, movementType: StockMovementType.TRANSFER_OUT, quantity: -50 }),
        }),
      );
      expect(prisma.stockLedgerEntry.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({ warehouseId: 20, movementType: StockMovementType.TRANSFER_IN, quantity: 50 }),
        }),
      );
      expect(result.status).toBe(WarehouseTransferStatus.RECEIVED);
    });

    it('nem ForbiddenException khi staff KHO NGUON (khong phai kho dich) co gang receive', async () => {
      prisma.warehouseTransfer.findFirst.mockResolvedValue(shippedTransfer);
      prisma.warehouse.findFirst.mockResolvedValue(fgWarehouse);

      await expect(service.receive(1, rmStaff)).rejects.toThrow(ForbiddenException);
    });

    it('nem ConflictException khi phieu chua SHIPPED (van con DRAFT)', async () => {
      prisma.warehouseTransfer.findFirst.mockResolvedValue(draftTransfer);

      await expect(service.receive(1, fgStaff)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('chi xoa duoc khi con DRAFT', async () => {
      prisma.warehouseTransfer.findFirst.mockResolvedValue({
        ...draftTransfer,
        status: WarehouseTransferStatus.SHIPPED,
      });

      await expect(service.remove(1, rmStaff)).rejects.toThrow(ConflictException);
    });

    it('xoa thanh cong khi con DRAFT va dung phong ban', async () => {
      prisma.warehouseTransfer.findFirst.mockResolvedValue(draftTransfer);
      prisma.warehouse.findFirst.mockResolvedValue(rmWarehouse);
      prisma.warehouseTransfer.update.mockResolvedValue({ ...draftTransfer, deletedAt: new Date() });

      await service.remove(1, rmStaff);
      expect(prisma.warehouseTransfer.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
    });
  });
});
