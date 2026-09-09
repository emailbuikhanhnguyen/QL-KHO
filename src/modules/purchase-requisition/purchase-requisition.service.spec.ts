import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PurchaseRequisitionService } from './purchase-requisition.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../common/notification/notification.service';

jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', DEPT_HEAD: 'DEPT_HEAD', BOD: 'BOD', PURCHASER: 'PURCHASER', REQUESTER: 'REQUESTER' },
  PurchaseRequisitionStatus: {
    DRAFT: 'DRAFT',
    PENDING_MANAGER_APPROVAL: 'PENDING_MANAGER_APPROVAL',
    PENDING_BOD_APPROVAL: 'PENDING_BOD_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
  },
}));

import { PurchaseRequisitionStatus, Role } from '@prisma/client';

describe('PurchaseRequisitionService', () => {
  let service: PurchaseRequisitionService;
  let prisma: any;
  let notification: any;

  const requester = { id: 100, role: Role.REQUESTER, departmentId: 1 };
  const deptHead = { id: 200, role: Role.DEPT_HEAD, departmentId: 1 };
  const deptHeadOther = { id: 201, role: Role.DEPT_HEAD, departmentId: 2 };
  const bod = { id: 300, role: Role.BOD, departmentId: 5 };

  const draftPq = {
    id: 1,
    code: 'PRQ-2026-000001',
    departmentId: 1,
    requestedBy: 100,
    reason: 'Mua vat tu van phong',
    status: PurchaseRequisitionStatus.DRAFT,
  };

  beforeEach(async () => {
    prisma = {
      purchaseRequisition: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      purchaseRequisitionLine: { deleteMany: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    notification = {
      getEmailsByRoleInDepartment: jest.fn().mockResolvedValue(['head@sec.com']),
      getEmailsByRole: jest.fn().mockResolvedValue(['bod@sec.com']),
      sendToEmails: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseRequisitionService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notification },
      ],
    }).compile();

    service = module.get<PurchaseRequisitionService>(PurchaseRequisitionService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('tao thanh cong voi nhieu dong vat tu', async () => {
      prisma.purchaseRequisition.count.mockResolvedValue(0);
      prisma.purchaseRequisition.create.mockResolvedValue(draftPq);

      const result = await service.create(
        {
          reason: 'Mua vat tu van phong',
          lines: [
            { itemName: 'Giay A4', quantity: 10, unit: 'thung' },
            { itemName: 'Muc in', quantity: 5, unit: 'hop' },
          ],
        },
        requester as any,
      );

      expect(result).toEqual(draftPq);
      const createArg = prisma.purchaseRequisition.create.mock.calls[0][0];
      expect(createArg.data.lines.create).toHaveLength(2);
    });

    it('sinh ma dung dinh dang PRQ-{nam}-{so thu tu}', async () => {
      prisma.purchaseRequisition.count.mockResolvedValue(6);
      prisma.purchaseRequisition.create.mockResolvedValue(draftPq);

      await service.create({ reason: 'x', lines: [{ itemName: 'A', quantity: 1, unit: 'cai' }] }, requester as any);

      const createArg = prisma.purchaseRequisition.create.mock.calls[0][0];
      expect(createArg.data.code).toMatch(/^PRQ-\d{4}-000007$/);
    });
  });

  describe('submit', () => {
    it('gui duyet thanh cong VA gui email cho Truong bo phan', async () => {
      prisma.purchaseRequisition.findUnique.mockResolvedValue(draftPq);
      prisma.purchaseRequisition.update.mockResolvedValue({ ...draftPq, status: PurchaseRequisitionStatus.PENDING_MANAGER_APPROVAL });

      const result = await service.submit(1, requester as any);

      expect(result.status).toBe(PurchaseRequisitionStatus.PENDING_MANAGER_APPROVAL);
      expect(notification.getEmailsByRoleInDepartment).toHaveBeenCalledWith(Role.DEPT_HEAD, 1);
      expect(notification.sendToEmails).toHaveBeenCalledWith(['head@sec.com'], expect.stringContaining('PRQ-2026-000001'), expect.any(String));
    });
  });

  describe('approveManager', () => {
    const pendingManagerPq = { ...draftPq, status: PurchaseRequisitionStatus.PENDING_MANAGER_APPROVAL };

    it('Truong bo phan CUNG phong ban duyet duoc, gui email cho BOD', async () => {
      prisma.purchaseRequisition.findUnique.mockResolvedValue(pendingManagerPq);
      prisma.purchaseRequisition.update.mockResolvedValue({ ...pendingManagerPq, status: PurchaseRequisitionStatus.PENDING_BOD_APPROVAL });

      const result = await service.approveManager(1, deptHead as any);

      expect(result.status).toBe(PurchaseRequisitionStatus.PENDING_BOD_APPROVAL);
      expect(notification.getEmailsByRole).toHaveBeenCalledWith(Role.BOD);
    });

    it('tu choi neu Truong bo phan KHAC phong ban', async () => {
      prisma.purchaseRequisition.findUnique.mockResolvedValue(pendingManagerPq);

      await expect(service.approveManager(1, deptHeadOther as any)).rejects.toThrow(ForbiddenException);
    });

    it('SoD: tu choi neu Truong bo phan tu tao yeu cau CHO CHINH MINH roi tu duyet', async () => {
      const ownPqByDeptHead = { ...pendingManagerPq, requestedBy: 200, departmentId: 1 };
      prisma.purchaseRequisition.findUnique.mockResolvedValue(ownPqByDeptHead);

      await expect(service.approveManager(1, deptHead as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approveBod', () => {
    it('BOD duyet xong: chuyen APPROVED VA gui email cho Purchaser', async () => {
      const pendingBodPq = { ...draftPq, status: PurchaseRequisitionStatus.PENDING_BOD_APPROVAL };
      prisma.purchaseRequisition.findUnique.mockResolvedValue(pendingBodPq);
      prisma.purchaseRequisition.update.mockResolvedValue({ ...pendingBodPq, status: PurchaseRequisitionStatus.APPROVED });

      const result = await service.approveBod(1, bod as any);

      expect(result.status).toBe(PurchaseRequisitionStatus.APPROVED);
      expect(notification.getEmailsByRole).toHaveBeenCalledWith(Role.PURCHASER);
      expect(notification.sendToEmails).toHaveBeenCalledWith(
        expect.any(Array),
        expect.stringContaining('đã được duyệt'),
        expect.any(String),
      );
    });

    it('khong duyet BOD duoc khi chua qua Truong bo phan', async () => {
      prisma.purchaseRequisition.findUnique.mockResolvedValue(draftPq);

      await expect(service.approveBod(1, bod as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('cancel / remove', () => {
    it('nguoi tao huy duoc khi dang cho duyet', async () => {
      const pendingPq = { ...draftPq, status: PurchaseRequisitionStatus.PENDING_MANAGER_APPROVAL };
      prisma.purchaseRequisition.findUnique.mockResolvedValue(pendingPq);
      prisma.purchaseRequisition.update.mockResolvedValue({ ...pendingPq, status: PurchaseRequisitionStatus.CANCELLED });

      const result = await service.cancel(1, requester as any);
      expect(result.status).toBe(PurchaseRequisitionStatus.CANCELLED);
    });

    it('khong xoa duoc khi da qua DRAFT', async () => {
      prisma.purchaseRequisition.findUnique.mockResolvedValue({ ...draftPq, status: PurchaseRequisitionStatus.PENDING_MANAGER_APPROVAL });

      await expect(service.remove(1, requester as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('reject', () => {
    it('Truong bo phan tu choi o cap quan ly', async () => {
      const pendingManagerPq = { ...draftPq, status: PurchaseRequisitionStatus.PENDING_MANAGER_APPROVAL };
      prisma.purchaseRequisition.findUnique.mockResolvedValue(pendingManagerPq);
      prisma.purchaseRequisition.update.mockResolvedValue({ ...pendingManagerPq, status: PurchaseRequisitionStatus.REJECTED });

      const result = await service.reject(1, { reason: 'Khong can thiet' }, deptHead as any);
      expect(result.status).toBe(PurchaseRequisitionStatus.REJECTED);
    });
  });

  describe('getItemNameSuggestions', () => {
    it('tra ve danh sach ten vat tu khong trung lap', async () => {
      prisma.purchaseRequisitionLine.findMany.mockResolvedValue([{ itemName: 'Giay A4' }, { itemName: 'Muc in' }]);

      const result = await service.getItemNameSuggestions();
      expect(result).toEqual(['Giay A4', 'Muc in']);
    });
  });
});
