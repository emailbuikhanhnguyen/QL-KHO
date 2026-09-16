import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ElectronicDocumentService } from './electronic-document.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../common/notification/notification.service';

jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', REQUESTER: 'REQUESTER' },
  ElectronicDocumentStatus: { DRAFT: 'DRAFT', PENDING_APPROVAL: 'PENDING_APPROVAL', APPROVED: 'APPROVED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED' },
  ApprovalStepStatus: { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', SKIPPED: 'SKIPPED' },
}));

import { ElectronicDocumentStatus, ApprovalStepStatus, Role } from '@prisma/client';

describe('ElectronicDocumentService', () => {
  let service: ElectronicDocumentService;
  let prisma: any;
  let notification: any;

  // So do to chuc gia lap cho test:
  //   100 (nhan vien) -> 200 (Sub-leader) -> 300 (Leader) -> 400 (Head dept, dinh cao nhat)
  const orgChart: Record<number, number | null> = { 100: 200, 200: 300, 300: 400, 400: null };

  const employee = { id: 100, role: Role.REQUESTER, departmentId: 1 };
  const subLeader = { id: 200, role: Role.REQUESTER, departmentId: 1 };
  const leader = { id: 300, role: Role.REQUESTER, departmentId: 1 };
  const headDept = { id: 400, role: Role.REQUESTER, departmentId: 1 };
  const admin = { id: 1, role: Role.ADMIN, departmentId: 1 };

  const draftDoc = {
    id: 1,
    code: 'ED-2026-000001',
    uploadedBy: 100,
    departmentId: 1,
    title: 'Bien ban giao ca',
    status: ElectronicDocumentStatus.DRAFT,
    approvalSteps: [],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(({ where }: any) => {
          const id = where.id;
          if (!(id in orgChart)) return Promise.resolve(null);
          return Promise.resolve({ id, reportsToId: orgChart[id], email: `user${id}@sec.com` });
        }),
        findMany: jest.fn(({ where }: any) => {
          const ids: number[] = where.id.in;
          return Promise.resolve(ids.filter((id) => id in orgChart).map((id) => ({ id, fullName: `User ${id}` })));
        }),
      },
      electronicDocument: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      documentApprovalStep: {
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    notification = {
      getEmailByUserId: jest.fn().mockResolvedValue('someone@sec.com'),
      sendToEmails: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElectronicDocumentService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notification },
      ],
    }).compile();

    service = module.get<ElectronicDocumentService>(ElectronicDocumentService);
    jest.clearAllMocks();
    prisma.electronicDocument.findUnique.mockResolvedValue(draftDoc);
  });

  describe('submit — xay chuoi duyet dong theo so do to chuc', () => {
    it('di dung theo reportsToId, dung LAI khi toi dinh cao nhat (reportsToId = null)', async () => {
      prisma.electronicDocument.update.mockResolvedValue({ ...draftDoc, status: ElectronicDocumentStatus.PENDING_APPROVAL });

      await service.submit(1, employee as any);

      const createArg = prisma.documentApprovalStep.createMany.mock.calls[0][0];
      const levels = createArg.data;
      expect(levels).toEqual([
        { documentId: 1, level: 1, approverId: 200, status: ApprovalStepStatus.PENDING },
        { documentId: 1, level: 2, approverId: 300, status: ApprovalStepStatus.PENDING },
        { documentId: 1, level: 3, approverId: 400, status: ApprovalStepStatus.PENDING },
      ]);
    });

    it('bao loi ro rang neu nguoi tao CHUA duoc cau hinh cap tren (reportsToId null ngay tu dau)', async () => {
      const orphanDoc = { ...draftDoc, uploadedBy: 400 }; // 400 la dinh cao nhat, khong co cap tren
      prisma.electronicDocument.findUnique.mockResolvedValue(orphanDoc);

      await expect(service.submit(1, headDept as any)).rejects.toThrow(BadRequestException);
    });

    it('phat hien VONG LAP trong so do to chuc, khong roi vao vong lap vo han', async () => {
      // Gia lap du lieu loi: 500 bao cao cho 600, 600 lai bao cao nguoc lai cho 500
      prisma.user.findUnique = jest.fn(({ where }: any) => {
        const cyclic: Record<number, number> = { 500: 600, 600: 500 };
        return Promise.resolve({ id: where.id, reportsToId: cyclic[where.id] ?? null });
      });
      prisma.user.findMany = jest.fn().mockResolvedValue([{ id: 500, fullName: 'User 500' }]);
      const cyclicDoc = { ...draftDoc, uploadedBy: 500 };
      prisma.electronicDocument.findUnique.mockResolvedValue(cyclicDoc);

      await expect(service.submit(1, { id: 500, role: Role.REQUESTER, departmentId: 1 } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveStep — duyet dung buoc dang PENDING', () => {
    const pendingDoc = {
      ...draftDoc,
      status: ElectronicDocumentStatus.PENDING_APPROVAL,
      approvalSteps: [
        { id: 10, level: 1, approverId: 200, status: ApprovalStepStatus.PENDING },
        { id: 11, level: 2, approverId: 300, status: ApprovalStepStatus.PENDING },
      ],
    };

    it('dung nguoi duyet cap 1 duyet duoc, KHONG chuyen APPROVED vi con cap 2', async () => {
      prisma.electronicDocument.findUnique.mockResolvedValue(pendingDoc);

      const result = await service.approveStep(1, {}, subLeader as any);

      expect(prisma.documentApprovalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 10 }, data: expect.objectContaining({ status: ApprovalStepStatus.APPROVED }) }),
      );
      // Khong duoc goi update ho so thanh APPROVED vi con buoc 2 cho duyet
      expect(prisma.electronicDocument.update).not.toHaveBeenCalled();
      expect(notification.sendToEmails).toHaveBeenCalledWith(
        expect.any(Array),
        expect.stringContaining('cần bạn duyệt'),
        expect.any(String),
      );
    });

    it('tu choi neu KHONG phai nguoi duoc phan cong duyet buoc hien tai (VD nguoi cap 2 duyet truoc cap 1)', async () => {
      prisma.electronicDocument.findUnique.mockResolvedValue(pendingDoc);

      await expect(service.approveStep(1, {}, leader as any)).rejects.toThrow(ForbiddenException);
    });

    it('duyet den buoc CUOI CUNG thi ho so chuyen APPROVED, bao email nguoi tao', async () => {
      const lastStepDoc = {
        ...draftDoc,
        status: ElectronicDocumentStatus.PENDING_APPROVAL,
        approvalSteps: [
          { id: 10, level: 1, approverId: 200, status: ApprovalStepStatus.APPROVED },
          { id: 11, level: 2, approverId: 300, status: ApprovalStepStatus.PENDING },
        ],
      };
      prisma.electronicDocument.findUnique.mockResolvedValue(lastStepDoc);
      prisma.electronicDocument.update.mockResolvedValue({ ...lastStepDoc, status: ElectronicDocumentStatus.APPROVED });

      await service.approveStep(1, {}, leader as any);

      expect(prisma.electronicDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: ElectronicDocumentStatus.APPROVED } }),
      );
      expect(notification.sendToEmails).toHaveBeenCalledWith(
        expect.any(Array),
        expect.stringContaining('đã được duyệt xong'),
        expect.any(String),
      );
    });

    it('Admin duyet thay duoc bat ky buoc nao (bypass)', async () => {
      prisma.electronicDocument.findUnique.mockResolvedValue(pendingDoc);

      await expect(service.approveStep(1, {}, admin as any)).resolves.toBeDefined();
    });
  });

  describe('rejectStep — tu choi dung phieu ngay, SKIPPED cac buoc con lai', () => {
    it('tu choi o cap 1: ho so REJECTED, cap 2 (chua toi) chuyen SKIPPED', async () => {
      const pendingDoc = {
        ...draftDoc,
        status: ElectronicDocumentStatus.PENDING_APPROVAL,
        approvalSteps: [
          { id: 10, level: 1, approverId: 200, status: ApprovalStepStatus.PENDING },
          { id: 11, level: 2, approverId: 300, status: ApprovalStepStatus.PENDING },
        ],
      };
      prisma.electronicDocument.findUnique.mockResolvedValue(pendingDoc);

      await service.rejectStep(1, { reason: 'Thieu chu ky xac nhan' }, subLeader as any);

      expect(prisma.documentApprovalStep.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: ApprovalStepStatus.SKIPPED } }),
      );
      expect(prisma.electronicDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: ElectronicDocumentStatus.REJECTED }) }),
      );
    });
  });

  describe('remove / cancel', () => {
    it('chi xoa duoc khi con DRAFT', async () => {
      const submittedDoc = { ...draftDoc, status: ElectronicDocumentStatus.PENDING_APPROVAL };
      prisma.electronicDocument.findUnique.mockResolvedValue(submittedDoc);

      await expect(service.remove(1, employee as any)).rejects.toThrow(ConflictException);
    });
  });
});
