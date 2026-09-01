import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { IssueRequestStatus, QcStatus, Role, StockMovementType } from '@prisma/client';
import { IssueRequestService } from './issue-request.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('IssueRequestService', () => {
  let service: IssueRequestService;
  let prisma: any;

  const rmDeptId = 1;
  const pmcDeptId = 2;
  const warehouseRM = { id: 10, departmentId: rmDeptId, deletedAt: null };

  const requester = { id: 100, role: Role.REQUESTER, departmentId: pmcDeptId };
  const deptHeadOfRequester = { id: 200, role: Role.DEPT_HEAD, departmentId: pmcDeptId };
  const deptHeadOtherDept = { id: 201, role: Role.DEPT_HEAD, departmentId: 999 };
  const bod = { id: 300, role: Role.BOD, departmentId: rmDeptId };
  const warehouseStaffRM = { id: 400, role: Role.WAREHOUSE_STAFF, departmentId: rmDeptId };
  const admin = { id: 1, role: Role.ADMIN, departmentId: rmDeptId };

  const draftRequest = {
    id: 1,
    warehouseId: 10,
    requesterId: 100,
    departmentId: pmcDeptId,
    status: IssueRequestStatus.DRAFT,
    deletedAt: null,
    lines: [{ id: 1000, itemId: 30, requestedQuantity: 50 }],
  };

  beforeEach(async () => {
    prisma = {
      issueRequest: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      issueRequestLine: { deleteMany: jest.fn(), update: jest.fn() },
      warehouse: { findFirst: jest.fn() },
      item: { findFirst: jest.fn() },
      lot: { findMany: jest.fn() },
      stockLedgerEntry: { create: jest.fn(), aggregate: jest.fn() },
      stocktakeLock: { findFirst: jest.fn() },
      $transaction: jest.fn(async (arg: any) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg(prisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [IssueRequestService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<IssueRequestService>(IssueRequestService);
    jest.clearAllMocks();
    prisma.$transaction = jest.fn(async (arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg(prisma);
    });
    prisma.stocktakeLock.findFirst.mockResolvedValue(null);
  });

  describe('create', () => {
    it('bat ky role nao cung tao duoc phieu, gan dung requesterId/departmentId', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);
      prisma.item.findFirst.mockResolvedValue({ id: 30 });
      prisma.issueRequest.create.mockResolvedValue({ id: 5, lines: [] });
      prisma.issueRequest.update.mockResolvedValue({ id: 5, code: 'ISS-2026-000005', lines: [] });

      await service.create(
        { warehouseId: 10, lines: [{ itemId: 30, requestedQuantity: 20 }] } as any,
        requester,
      );

      expect(prisma.issueRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requesterId: 100, departmentId: pmcDeptId }),
        }),
      );
    });
  });

  describe('submit', () => {
    it('chi nguoi tao moi gui duyet duoc phieu cua minh', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(draftRequest);
      const otherUser = { id: 999, role: Role.REQUESTER, departmentId: pmcDeptId };

      await expect(service.submit(1, otherUser)).rejects.toThrow(ForbiddenException);
    });

    it('gui duyet thanh cong: DRAFT -> PENDING_HEAD_APPROVAL', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(draftRequest);
      prisma.issueRequest.update.mockResolvedValue({
        ...draftRequest,
        status: IssueRequestStatus.PENDING_HEAD_APPROVAL,
      });

      const result = await service.submit(1, requester);
      expect(result.status).toBe(IssueRequestStatus.PENDING_HEAD_APPROVAL);
    });
  });

  describe('approveByHead', () => {
    const pending = { ...draftRequest, status: IssueRequestStatus.PENDING_HEAD_APPROVAL };

    it('Truong bo phan CUNG phong ban voi nguoi yeu cau duyet thanh cong', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(pending);
      prisma.issueRequest.update.mockResolvedValue({
        ...pending,
        status: IssueRequestStatus.PENDING_BOD_APPROVAL,
      });

      const result = await service.approveByHead(1, deptHeadOfRequester);
      expect(result.status).toBe(IssueRequestStatus.PENDING_BOD_APPROVAL);
    });

    it('nem ForbiddenException khi Truong bo phan KHAC phong ban co gang duyet', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(pending);

      await expect(service.approveByHead(1, deptHeadOtherDept)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('nem ForbiddenException khi REQUESTER tu duyet phieu cua chinh minh', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(pending);

      await expect(service.approveByHead(1, requester)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approveByBod', () => {
    const pendingBod = { ...draftRequest, status: IssueRequestStatus.PENDING_BOD_APPROVAL };

    it('BOD duyet thanh cong: -> APPROVED', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(pendingBod);
      prisma.issueRequest.update.mockResolvedValue({
        ...pendingBod,
        status: IssueRequestStatus.APPROVED,
      });

      const result = await service.approveByBod(1, bod);
      expect(result.status).toBe(IssueRequestStatus.APPROVED);
    });

    it('nem ForbiddenException khi DEPT_HEAD co gang duyet cap BOD', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(pendingBod);

      await expect(service.approveByBod(1, deptHeadOfRequester)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('reject', () => {
    it('DEPT_HEAD tu choi duoc o cap PENDING_HEAD_APPROVAL', async () => {
      const pending = { ...draftRequest, status: IssueRequestStatus.PENDING_HEAD_APPROVAL };
      prisma.issueRequest.findFirst.mockResolvedValue(pending);
      prisma.issueRequest.update.mockResolvedValue({
        ...pending,
        status: IssueRequestStatus.REJECTED,
      });

      const result = await service.reject(1, { reason: 'Khong hop ly' }, deptHeadOfRequester);
      expect(result.status).toBe(IssueRequestStatus.REJECTED);
    });

    it('DEPT_HEAD KHONG tu choi duoc o cap PENDING_BOD_APPROVAL (sai cap)', async () => {
      const pendingBod = { ...draftRequest, status: IssueRequestStatus.PENDING_BOD_APPROVAL };
      prisma.issueRequest.findFirst.mockResolvedValue(pendingBod);

      await expect(
        service.reject(1, { reason: 'x' }, deptHeadOfRequester),
      ).rejects.toThrow(ForbiddenException);
    });

    it('nem ConflictException khi phieu dang DRAFT (chua co gi de tu choi)', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(draftRequest);

      await expect(service.reject(1, { reason: 'x' }, admin)).rejects.toThrow(ConflictException);
    });
  });

  describe('issue — FEFO allocation', () => {
    const approvedRequest = {
      ...draftRequest,
      status: IssueRequestStatus.APPROVED,
      lines: [{ id: 1000, itemId: 30, requestedQuantity: 50 }],
    };

    it('du ton trong 1 lot: xuat du so luong yeu cau', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(approvedRequest);
      prisma.lot.findMany.mockResolvedValue([{ id: 500, expiryDate: null }]);
      prisma.stockLedgerEntry.aggregate.mockResolvedValue({ _sum: { quantity: 100 } });
      prisma.stockLedgerEntry.create.mockResolvedValue({});
      prisma.issueRequestLine.update.mockResolvedValue({});
      prisma.issueRequest.update.mockResolvedValue({
        ...approvedRequest,
        status: IssueRequestStatus.ISSUED,
      });

      await service.issue(1, warehouseStaffRM);

      expect(prisma.stockLedgerEntry.create).toHaveBeenCalledTimes(1);
      expect(prisma.stockLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lotId: 500,
            quantity: -50,
            movementType: StockMovementType.ISSUE,
          }),
        }),
      );
      expect(prisma.issueRequestLine.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { issuedQuantity: 50 } }),
      );
    });

    it('FEFO: chia nho qua 2 lot theo thu tu het han truoc', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(approvedRequest);
      prisma.lot.findMany.mockResolvedValue([
        { id: 501, expiryDate: new Date('2026-09-01') }, // het han som hon -> uu tien
        { id: 502, expiryDate: new Date('2026-12-01') },
      ]);
      prisma.stockLedgerEntry.aggregate.mockImplementation(({ where }: any) => {
        if (where.lotId === 501) return Promise.resolve({ _sum: { quantity: 30 } });
        if (where.lotId === 502) return Promise.resolve({ _sum: { quantity: 100 } });
        return Promise.resolve({ _sum: { quantity: 0 } });
      });
      prisma.stockLedgerEntry.create.mockResolvedValue({});
      prisma.issueRequestLine.update.mockResolvedValue({});
      prisma.issueRequest.update.mockResolvedValue({
        ...approvedRequest,
        status: IssueRequestStatus.ISSUED,
      });

      await service.issue(1, warehouseStaffRM);

      // Lot 501 het truoc -> lay het 30, con thieu 20 lay tu lot 502
      expect(prisma.stockLedgerEntry.create).toHaveBeenCalledTimes(2);
      expect(prisma.stockLedgerEntry.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: expect.objectContaining({ lotId: 501, quantity: -30 }) }),
      );
      expect(prisma.stockLedgerEntry.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ data: expect.objectContaining({ lotId: 502, quantity: -20 }) }),
      );
      expect(prisma.issueRequestLine.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { issuedQuantity: 50 } }),
      );
    });

    it('PARTIAL ISSUE: ton kha dung khong du van xuat phan con lai, khong nem loi', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(approvedRequest);
      prisma.lot.findMany.mockResolvedValue([{ id: 503, expiryDate: null }]);
      prisma.stockLedgerEntry.aggregate.mockResolvedValue({ _sum: { quantity: 10 } }); // chi co 10, can 50
      prisma.stockLedgerEntry.create.mockResolvedValue({});
      prisma.issueRequestLine.update.mockResolvedValue({});
      prisma.issueRequest.update.mockResolvedValue({
        ...approvedRequest,
        status: IssueRequestStatus.ISSUED,
      });

      await service.issue(1, warehouseStaffRM);

      expect(prisma.issueRequestLine.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { issuedQuantity: 10 } }), // chi xuat duoc 10/50
      );
    });

    it('chi xet Lot co qcStatus PASSED/PARTIALLY_PASSED (truyen dung dieu kien where)', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(approvedRequest);
      prisma.lot.findMany.mockResolvedValue([]);
      prisma.issueRequest.update.mockResolvedValue({
        ...approvedRequest,
        status: IssueRequestStatus.ISSUED,
      });

      await service.issue(1, warehouseStaffRM);

      expect(prisma.lot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            qcStatus: { in: [QcStatus.PASSED, QcStatus.PARTIALLY_PASSED] },
          }),
        }),
      );
    });

    it('chi tinh ton trong DUNG KHO dang xuat, khong tinh gop kho khac (fix bug)', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(approvedRequest); // warehouseId = 10
      prisma.lot.findMany.mockResolvedValue([{ id: 504, expiryDate: null }]);

      // Mock aggregate: lo nay co 200 o KHO KHAC (warehouseId=99), nhung
      // chi co 5 o dung kho dang xuat (warehouseId=10). Neu tinh gop se ra
      // sai (issued=50), tinh dung theo kho se ra issued=5 (thieu).
      prisma.stockLedgerEntry.aggregate.mockImplementation(({ where }: any) => {
        if (where.lotId === 504 && where.warehouseId === 10) {
          return Promise.resolve({ _sum: { quantity: 5 } });
        }
        return Promise.resolve({ _sum: { quantity: 0 } });
      });
      prisma.stockLedgerEntry.create.mockResolvedValue({});
      prisma.issueRequestLine.update.mockResolvedValue({});
      prisma.issueRequest.update.mockResolvedValue({
        ...approvedRequest,
        status: IssueRequestStatus.ISSUED,
      });

      await service.issue(1, warehouseStaffRM);

      // Phai truyen dung warehouseId vao where cua aggregate
      expect(prisma.stockLedgerEntry.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { lotId: 504, warehouseId: 10 } }),
      );
      // Va chi xuat duoc 5 (dung theo kho), khong phai 50 (neu tinh nham gop kho khac)
      expect(prisma.issueRequestLine.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { issuedQuantity: 5 } }),
      );
    });

    it('nem ForbiddenException khi WAREHOUSE_STAFF khac phong ban co gang xuat', async () => {
      const staffOtherDept = { id: 401, role: Role.WAREHOUSE_STAFF, departmentId: 999 };
      prisma.issueRequest.findFirst.mockResolvedValue(approvedRequest);
      prisma.warehouse.findFirst.mockResolvedValue(warehouseRM);

      await expect(service.issue(1, staffOtherDept)).rejects.toThrow(ForbiddenException);
    });

    it('nem ConflictException khi phieu chua APPROVED', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(draftRequest); // van DRAFT

      await expect(service.issue(1, warehouseStaffRM)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('chi nguoi tao moi xoa duoc phieu DRAFT cua minh', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(draftRequest);
      const otherUser = { id: 999, role: Role.REQUESTER, departmentId: pmcDeptId };

      await expect(service.remove(1, otherUser)).rejects.toThrow(ForbiddenException);
    });

    it('xoa thanh cong khi la chu phieu va con DRAFT', async () => {
      prisma.issueRequest.findFirst.mockResolvedValue(draftRequest);
      prisma.issueRequest.update.mockResolvedValue({ ...draftRequest, deletedAt: new Date() });

      await service.remove(1, requester);
      expect(prisma.issueRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
    });
  });
});
