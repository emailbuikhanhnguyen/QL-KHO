import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DisposalRequestService } from './disposal-request.service';
import { PrismaService } from '../../prisma/prisma.service';

// Sandbox nay khong tai duoc Prisma engine binary qua mang (bi chan) nen
// ban Prisma Client generate ra thieu han cac object enum (Role, QcStatus...).
// Day CHI la gioi han cua sandbox — tren may that (co mang day du) chay
// `npx prisma generate` binh thuong se co du, khong can doan gia lap nay.
// Tu cung cap dung cac enum can dung duoi dang string-enum (dung hanh vi
// that cua Prisma: moi gia tri enum string chinh la chinh no).
jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', WAREHOUSE_STAFF: 'WAREHOUSE_STAFF', QC_MANAGER: 'QC_MANAGER', BOD: 'BOD' },
  QcStatus: {
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    PASSED: 'PASSED',
    FAILED: 'FAILED',
    PARTIALLY_PASSED: 'PARTIALLY_PASSED',
    PENDING_DISPOSITION: 'PENDING_DISPOSITION',
    DISPOSED: 'DISPOSED',
  },
  DisposalRequestStatus: {
    DRAFT: 'DRAFT',
    PENDING_QA_APPROVAL: 'PENDING_QA_APPROVAL',
    PENDING_BOD_APPROVAL: 'PENDING_BOD_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
  },
  StockMovementType: { RECEIPT: 'RECEIPT', ISSUE: 'ISSUE', TRANSFER_IN: 'TRANSFER_IN', TRANSFER_OUT: 'TRANSFER_OUT', ADJUSTMENT: 'ADJUSTMENT', RETURN: 'RETURN' },
}));

import { DisposalRequestStatus, QcStatus, StockMovementType, Role } from '@prisma/client';

describe('DisposalRequestService', () => {
  let service: DisposalRequestService;
  let prisma: any;

  const warehouseStaff = { id: 100, role: Role.WAREHOUSE_STAFF, departmentId: 1 };
  const qcManager = { id: 200, role: Role.QC_MANAGER, departmentId: 1 };
  const bod = { id: 300, role: Role.BOD, departmentId: 1 };
  const admin = { id: 1, role: Role.ADMIN, departmentId: 1 };

  const failedLot = { id: 1, itemId: 10, qcStatus: QcStatus.FAILED, deletedAt: null };
  const warehouse1 = { id: 1, deletedAt: null };

  const draftDr = {
    id: 1,
    code: 'DSP-2026-000001',
    lotId: 1,
    warehouseId: 1,
    quantity: 20,
    status: DisposalRequestStatus.DRAFT,
    requestedBy: 100,
    lot: failedLot,
    warehouse: warehouse1,
  };

  beforeEach(async () => {
    prisma = {
      lot: { findUnique: jest.fn(), update: jest.fn() },
      warehouse: { findFirst: jest.fn() },
      disposalRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      stockLedgerEntry: { create: jest.fn(), aggregate: jest.fn() },
      $transaction: jest.fn(async (arg: any) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg(prisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DisposalRequestService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<DisposalRequestService>(DisposalRequestService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('tao thanh cong khi lo dang FAILED va du ton kha dung', async () => {
      prisma.lot.findUnique.mockResolvedValue(failedLot);
      prisma.warehouse.findFirst.mockResolvedValue(warehouse1);
      prisma.stockLedgerEntry.aggregate.mockResolvedValue({ _sum: { quantity: 50 } });
      prisma.disposalRequest.count.mockResolvedValue(0);
      prisma.disposalRequest.create.mockResolvedValue(draftDr);

      const result = await service.create(
        { lotId: 1, warehouseId: 1, quantity: 20, reason: 'Rach vai, khong dung duoc' },
        warehouseStaff as any,
      );

      expect(result).toEqual(draftDr);
      expect(prisma.lot.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { qcStatus: QcStatus.PENDING_DISPOSITION, updatedBy: 100 },
      });
    });

    it('tu choi neu Lot khong o trang thai FAILED', async () => {
      prisma.lot.findUnique.mockResolvedValue({ ...failedLot, qcStatus: QcStatus.PASSED });

      await expect(
        service.create({ lotId: 1, warehouseId: 1, quantity: 20, reason: 'x' }, warehouseStaff as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('tu choi neu so luong huy vuot qua ton kha dung', async () => {
      prisma.lot.findUnique.mockResolvedValue(failedLot);
      prisma.warehouse.findFirst.mockResolvedValue(warehouse1);
      prisma.stockLedgerEntry.aggregate.mockResolvedValue({ _sum: { quantity: 10 } }); // chi con 10

      await expect(
        service.create({ lotId: 1, warehouseId: 1, quantity: 20, reason: 'x' }, warehouseStaff as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('sinh ma code dung dinh dang DSP-{nam}-{so thu tu}', async () => {
      prisma.lot.findUnique.mockResolvedValue(failedLot);
      prisma.warehouse.findFirst.mockResolvedValue(warehouse1);
      prisma.stockLedgerEntry.aggregate.mockResolvedValue({ _sum: { quantity: 50 } });
      prisma.disposalRequest.count.mockResolvedValue(4); // da co 4 phieu trong nam
      prisma.disposalRequest.create.mockResolvedValue(draftDr);

      await service.create({ lotId: 1, warehouseId: 1, quantity: 20, reason: 'x' }, warehouseStaff as any);

      const createArg = prisma.disposalRequest.create.mock.calls[0][0];
      expect(createArg.data.code).toMatch(/^DSP-\d{4}-000005$/);
    });
  });

  describe('submit / quyen so huu', () => {
    it('chi nguoi tao (hoac Admin) moi gui duyet duoc', async () => {
      prisma.disposalRequest.findUnique.mockResolvedValue(draftDr); // requestedBy = 100

      await expect(service.submit(1, qcManager as any)).rejects.toThrow(ForbiddenException); // id 200 != 100
    });

    it('Admin luon gui duyet duoc du khong phai nguoi tao', async () => {
      prisma.disposalRequest.findUnique.mockResolvedValue(draftDr);
      prisma.disposalRequest.update.mockResolvedValue({ ...draftDr, status: DisposalRequestStatus.PENDING_QA_APPROVAL });

      const result = await service.submit(1, admin as any);
      expect(result.status).toBe(DisposalRequestStatus.PENDING_QA_APPROVAL);
    });

    it('khong gui duyet duoc neu khong con DRAFT', async () => {
      prisma.disposalRequest.findUnique.mockResolvedValue({ ...draftDr, status: DisposalRequestStatus.APPROVED });

      await expect(service.submit(1, warehouseStaff as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('approveQa / approveBod', () => {
    const pendingQaDr = { ...draftDr, status: DisposalRequestStatus.PENDING_QA_APPROVAL };
    const pendingBodDr = { ...draftDr, status: DisposalRequestStatus.PENDING_BOD_APPROVAL };

    it('QA duyet dung chuyen sang PENDING_BOD_APPROVAL', async () => {
      prisma.disposalRequest.findUnique.mockResolvedValue(pendingQaDr);
      prisma.disposalRequest.update.mockResolvedValue({ ...pendingQaDr, status: DisposalRequestStatus.PENDING_BOD_APPROVAL });

      const result = await service.approveQa(1, qcManager as any);
      expect(result.status).toBe(DisposalRequestStatus.PENDING_BOD_APPROVAL);
    });

    it('BOD duyet xong: tao StockLedgerEntry am + Lot chuyen DISPOSED', async () => {
      prisma.disposalRequest.findUnique.mockResolvedValue(pendingBodDr);
      prisma.disposalRequest.update.mockResolvedValue({ ...pendingBodDr, status: DisposalRequestStatus.APPROVED });

      await service.approveBod(1, bod as any);

      expect(prisma.stockLedgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          lotId: 1,
          itemId: 10,
          warehouseId: 1,
          movementType: StockMovementType.ADJUSTMENT,
          quantity: -20, // am
          referenceType: 'DISPOSAL_REQUEST',
          referenceId: 1,
        }),
      });
      expect(prisma.lot.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { qcStatus: QcStatus.DISPOSED, updatedBy: 300 },
      });
    });

    it('khong duyet BOD duoc khi chua qua QA (van con DRAFT)', async () => {
      prisma.disposalRequest.findUnique.mockResolvedValue(draftDr);

      await expect(service.approveBod(1, bod as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('reject', () => {
    it('tu choi o cap QA: Lot tro lai FAILED', async () => {
      const pendingQaDr = { ...draftDr, status: DisposalRequestStatus.PENDING_QA_APPROVAL };
      prisma.disposalRequest.findUnique.mockResolvedValue(pendingQaDr);
      prisma.disposalRequest.update.mockResolvedValue({ ...pendingQaDr, status: DisposalRequestStatus.REJECTED });

      await service.reject(1, { reason: 'Khong du chung tu' }, qcManager as any);

      expect(prisma.lot.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { qcStatus: QcStatus.FAILED, updatedBy: 200 },
      });
    });
  });

  describe('remove', () => {
    it('xoa DRAFT: Lot tro lai FAILED', async () => {
      prisma.disposalRequest.findUnique.mockResolvedValue(draftDr);

      await service.remove(1, warehouseStaff as any);

      expect(prisma.disposalRequest.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(prisma.lot.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { qcStatus: QcStatus.FAILED, updatedBy: 100 },
      });
    });

    it('khong xoa duoc khi da qua DRAFT', async () => {
      prisma.disposalRequest.findUnique.mockResolvedValue({ ...draftDr, status: DisposalRequestStatus.PENDING_QA_APPROVAL });

      await expect(service.remove(1, warehouseStaff as any)).rejects.toThrow(ConflictException);
    });
  });
});
