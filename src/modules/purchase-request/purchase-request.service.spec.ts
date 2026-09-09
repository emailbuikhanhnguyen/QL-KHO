import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PurchaseRequestService } from './purchase-request.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../common/notification/notification.service';

jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', DEPT_HEAD: 'DEPT_HEAD', ACCOUNTANT: 'ACCOUNTANT', PURCHASER: 'PURCHASER' },
  PurchaseRequisitionStatus: { DRAFT: 'DRAFT', APPROVED: 'APPROVED', PENDING_BOD_APPROVAL: 'PENDING_BOD_APPROVAL' },
  PurchaseRequestStatus: {
    DRAFT: 'DRAFT',
    PENDING_MANAGER_APPROVAL: 'PENDING_MANAGER_APPROVAL',
    PENDING_ACCOUNTANT_APPROVAL: 'PENDING_ACCOUNTANT_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
  },
}));

import { PurchaseRequestStatus, PurchaseRequisitionStatus, Role } from '@prisma/client';

describe('PurchaseRequestService', () => {
  let service: PurchaseRequestService;
  let prisma: any;
  let notification: any;

  const purchaser = { id: 400, role: Role.PURCHASER, departmentId: 6 };
  const deptHead = { id: 200, role: Role.DEPT_HEAD, departmentId: 1 };
  const accountant = { id: 500, role: Role.ACCOUNTANT, departmentId: 7 };

  const approvedRequisition = { id: 1, status: PurchaseRequisitionStatus.APPROVED, departmentId: 1 };

  const draftPr = {
    id: 1,
    code: 'PR-2026-000001',
    purchaseRequisitionId: 1,
    createdBy: 400,
    totalAmountUsd: 500,
    status: PurchaseRequestStatus.DRAFT,
    purchaseRequisition: { departmentId: 1 },
  };

  beforeEach(async () => {
    prisma = {
      purchaseRequisition: { findUnique: jest.fn() },
      purchaseRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      purchaseRequestLine: { deleteMany: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 400, email: 'purchaser@sec.com' }) },
      $transaction: jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    notification = {
      getEmailsByRoleInDepartment: jest.fn().mockResolvedValue(['head@sec.com']),
      getEmailsByRole: jest.fn().mockResolvedValue(['accountant@sec.com']),
      sendToEmails: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseRequestService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notification },
      ],
    }).compile();

    service = module.get<PurchaseRequestService>(PurchaseRequestService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('tao thanh cong tu Requisition da APPROVED, tinh dung tong tien', async () => {
      prisma.purchaseRequisition.findUnique.mockResolvedValue(approvedRequisition);
      prisma.purchaseRequest.count.mockResolvedValue(0);
      prisma.purchaseRequest.create.mockResolvedValue(draftPr);

      await service.create(
        {
          purchaseRequisitionId: 1,
          lines: [
            { itemName: 'Giay A4', quantity: 10, unit: 'thung', unitPriceUsd: 20 },
            { itemName: 'Muc in', quantity: 5, unit: 'hop', unitPriceUsd: 60 },
          ],
        },
        purchaser as any,
      );

      const createArg = prisma.purchaseRequest.create.mock.calls[0][0];
      expect(createArg.data.totalAmountUsd).toBe(500); // 10*20 + 5*60 = 200+300=500
      expect(createArg.data.lines.create[0].lineTotalUsd).toBe(200);
    });

    it('tu choi neu Requisition CHUA duoc BOD duyet', async () => {
      prisma.purchaseRequisition.findUnique.mockResolvedValue({ ...approvedRequisition, status: PurchaseRequisitionStatus.PENDING_BOD_APPROVAL });

      await expect(
        service.create({ purchaseRequisitionId: 1, lines: [{ itemName: 'A', quantity: 1, unit: 'cai', unitPriceUsd: 1 }] }, purchaser as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveManager — nguong 2000 USD', () => {
    const pendingManagerPr = { ...draftPr, status: PurchaseRequestStatus.PENDING_MANAGER_APPROVAL };

    it('duoi nguong: duyet binh thuong KHONG can xac nhan email BOD', async () => {
      prisma.purchaseRequest.findUnique.mockResolvedValue(pendingManagerPr); // totalAmountUsd = 500, duoi 2000
      prisma.purchaseRequest.update.mockResolvedValue({ ...pendingManagerPr, status: PurchaseRequestStatus.PENDING_ACCOUNTANT_APPROVAL });

      const result = await service.approveManager(1, {}, deptHead as any);

      expect(result.status).toBe(PurchaseRequestStatus.PENDING_ACCOUNTANT_APPROVAL);
      const updateArg = prisma.purchaseRequest.update.mock.calls[0][0];
      expect(updateArg.data.managerConfirmedBodEmailAt).toBeUndefined();
    });

    it('VUOT nguong (>2000): tu choi neu CHUA xac nhan da gui mail BOD', async () => {
      const overThresholdPr = { ...pendingManagerPr, totalAmountUsd: 2500 };
      prisma.purchaseRequest.findUnique.mockResolvedValue(overThresholdPr);

      await expect(service.approveManager(1, {}, deptHead as any)).rejects.toThrow(BadRequestException);
      await expect(service.approveManager(1, { confirmedEmailToBod: false }, deptHead as any)).rejects.toThrow(BadRequestException);
    });

    it('VUOT nguong (>2000): duyet duoc NEU da xac nhan gui mail BOD, luu lai thoi diem xac nhan', async () => {
      const overThresholdPr = { ...pendingManagerPr, totalAmountUsd: 2500 };
      prisma.purchaseRequest.findUnique.mockResolvedValue(overThresholdPr);
      prisma.purchaseRequest.update.mockResolvedValue({ ...overThresholdPr, status: PurchaseRequestStatus.PENDING_ACCOUNTANT_APPROVAL });

      const result = await service.approveManager(1, { confirmedEmailToBod: true }, deptHead as any);

      expect(result.status).toBe(PurchaseRequestStatus.PENDING_ACCOUNTANT_APPROVAL);
      const updateArg = prisma.purchaseRequest.update.mock.calls[0][0];
      expect(updateArg.data.managerConfirmedBodEmailAt).toBeInstanceOf(Date);
      expect(notification.getEmailsByRole).toHaveBeenCalledWith(Role.ACCOUNTANT);
    });

    it('SoD: Purchaser tao phieu khong tu duyet duoc cap quan ly cho chinh minh', async () => {
      // gia lap deptHead CHINH LA nguoi tao (id trung voi createdBy)
      const ownPrByCreator = { ...pendingManagerPr, createdBy: 200 };
      prisma.purchaseRequest.findUnique.mockResolvedValue(ownPrByCreator);

      await expect(service.approveManager(1, {}, deptHead as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approveAccountant', () => {
    it('Ke toan duyet xong: chuyen APPROVED va gui email cho Purchaser', async () => {
      const pendingAccountantPr = { ...draftPr, status: PurchaseRequestStatus.PENDING_ACCOUNTANT_APPROVAL };
      prisma.purchaseRequest.findUnique.mockResolvedValue(pendingAccountantPr);
      prisma.purchaseRequest.update.mockResolvedValue({ ...pendingAccountantPr, status: PurchaseRequestStatus.APPROVED });

      const result = await service.approveAccountant(1, accountant as any);

      expect(result.status).toBe(PurchaseRequestStatus.APPROVED);
      expect(notification.sendToEmails).toHaveBeenCalledWith(
        ['purchaser@sec.com'],
        expect.stringContaining('đã được duyệt xong'),
        expect.any(String),
      );
    });

    it('khong duyet Ke toan duoc khi chua qua Truong bo phan', async () => {
      prisma.purchaseRequest.findUnique.mockResolvedValue(draftPr);

      await expect(service.approveAccountant(1, accountant as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('cancel / remove', () => {
    it('Purchaser huy duoc khi dang cho duyet', async () => {
      const pendingPr = { ...draftPr, status: PurchaseRequestStatus.PENDING_MANAGER_APPROVAL };
      prisma.purchaseRequest.findUnique.mockResolvedValue(pendingPr);
      prisma.purchaseRequest.update.mockResolvedValue({ ...pendingPr, status: PurchaseRequestStatus.CANCELLED });

      const result = await service.cancel(1, purchaser as any);
      expect(result.status).toBe(PurchaseRequestStatus.CANCELLED);
    });

    it('khong xoa duoc khi da qua DRAFT', async () => {
      prisma.purchaseRequest.findUnique.mockResolvedValue({ ...draftPr, status: PurchaseRequestStatus.PENDING_MANAGER_APPROVAL });

      await expect(service.remove(1, purchaser as any)).rejects.toThrow(ConflictException);
    });
  });
});
