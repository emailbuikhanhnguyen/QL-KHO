import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { LeaveRequestService } from './leave-request.service';
import { PrismaService } from '../../prisma/prisma.service';

// Sandbox nay khong tai duoc Prisma engine binary qua mang (bi chan) nen
// ban Prisma Client generate ra thieu han cac object enum. Day CHI la gioi
// han cua sandbox — tren may that (co mang day du) chay `npx prisma
// generate` binh thuong se co du, khong can doan gia lap nay.
jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', WAREHOUSE_STAFF: 'WAREHOUSE_STAFF', DEPT_HEAD: 'DEPT_HEAD', HR: 'HR', BOD: 'BOD', QC_MANAGER: 'QC_MANAGER', REQUESTER: 'REQUESTER' },
  LeaveType: { ANNUAL: 'ANNUAL', UNPAID: 'UNPAID', SICK: 'SICK', OTHER: 'OTHER' },
  LeaveRequestStatus: {
    DRAFT: 'DRAFT',
    PENDING_MANAGER_APPROVAL: 'PENDING_MANAGER_APPROVAL',
    PENDING_HR_APPROVAL: 'PENDING_HR_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
  },
}));

import { LeaveRequestStatus, Role } from '@prisma/client';

describe('LeaveRequestService', () => {
  let service: LeaveRequestService;
  let prisma: any;

  const employee = { id: 100, role: Role.REQUESTER, departmentId: 1 };
  const deptHead = { id: 200, role: Role.DEPT_HEAD, departmentId: 1 };
  const deptHeadOtherDept = { id: 201, role: Role.DEPT_HEAD, departmentId: 2 };
  const hr = { id: 300, role: Role.HR, departmentId: 5 };
  const admin = { id: 1, role: Role.ADMIN, departmentId: 1 };

  const draftLr = {
    id: 1,
    code: 'LR-2026-000001',
    requestedBy: 100,
    departmentId: 1,
    status: LeaveRequestStatus.DRAFT,
    startDate: new Date('2026-09-10'),
    endDate: new Date('2026-09-12'),
  };

  beforeEach(async () => {
    prisma = {
      leaveRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LeaveRequestService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LeaveRequestService>(LeaveRequestService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('tao thanh cong voi ngay hop le', async () => {
      prisma.leaveRequest.count.mockResolvedValue(0);
      prisma.leaveRequest.create.mockResolvedValue(draftLr);

      const result = await service.create(
        { leaveType: 'ANNUAL' as any, startDate: '2026-09-10', endDate: '2026-09-12', reason: 'Ve que' },
        employee as any,
      );

      expect(result).toEqual(draftLr);
      const createArg = prisma.leaveRequest.create.mock.calls[0][0];
      expect(createArg.data.departmentId).toBe(1); // lay tu currentUser, khong phai nguoi dung tu chon
      expect(createArg.data.requestedBy).toBe(100);
    });

    it('tu choi neu ngay bat dau sau ngay ket thuc', async () => {
      await expect(
        service.create({ leaveType: 'ANNUAL' as any, startDate: '2026-09-15', endDate: '2026-09-10', reason: 'x' }, employee as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('sinh ma dung dinh dang LR-{nam}-{so thu tu}', async () => {
      prisma.leaveRequest.count.mockResolvedValue(4);
      prisma.leaveRequest.create.mockResolvedValue(draftLr);

      await service.create({ leaveType: 'SICK' as any, startDate: '2026-09-10', endDate: '2026-09-10', reason: 'x' }, employee as any);

      const createArg = prisma.leaveRequest.create.mock.calls[0][0];
      expect(createArg.data.code).toMatch(/^LR-\d{4}-000005$/);
    });
  });

  describe('quyen so huu', () => {
    it('chi nguoi tao (hoac Admin) moi gui duyet duoc', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(draftLr); // requestedBy = 100
      const otherEmployee = { id: 999, role: Role.REQUESTER, departmentId: 1 };

      await expect(service.submit(1, otherEmployee as any)).rejects.toThrow(ForbiddenException);
    });

    it('Admin luon thao tac duoc du khong phai nguoi tao', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(draftLr);
      prisma.leaveRequest.update.mockResolvedValue({ ...draftLr, status: LeaveRequestStatus.PENDING_MANAGER_APPROVAL });

      const result = await service.submit(1, admin as any);
      expect(result.status).toBe(LeaveRequestStatus.PENDING_MANAGER_APPROVAL);
    });
  });

  describe('approveManager', () => {
    const pendingManagerLr = { ...draftLr, status: LeaveRequestStatus.PENDING_MANAGER_APPROVAL };

    it('Truong bo phan CUNG phong ban duyet duoc, chuyen sang PENDING_HR_APPROVAL', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingManagerLr);
      prisma.leaveRequest.update.mockResolvedValue({ ...pendingManagerLr, status: LeaveRequestStatus.PENDING_HR_APPROVAL });

      const result = await service.approveManager(1, deptHead as any);
      expect(result.status).toBe(LeaveRequestStatus.PENDING_HR_APPROVAL);
    });

    it('tu choi neu Truong bo phan KHAC phong ban', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingManagerLr);

      await expect(service.approveManager(1, deptHeadOtherDept as any)).rejects.toThrow(ForbiddenException);
    });

    it('SoD: tu choi neu Truong bo phan tu tao don CHO CHINH MINH roi tu duyet', async () => {
      // don nay do CHINH deptHead (id: 200) tao ra cho ban than, khong phai employee (id: 100)
      const ownLeaveByDeptHead = { ...pendingManagerLr, requestedBy: 200, departmentId: 1 };
      prisma.leaveRequest.findUnique.mockResolvedValue(ownLeaveByDeptHead);

      await expect(service.approveManager(1, deptHead as any)).rejects.toThrow(ForbiddenException);
    });

    it('khong duyet duoc neu chua o dung trang thai cho duyet quan ly', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(draftLr); // van con DRAFT

      await expect(service.approveManager(1, deptHead as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('approveHr', () => {
    it('HR duyet xong chuyen sang APPROVED', async () => {
      const pendingHrLr = { ...draftLr, status: LeaveRequestStatus.PENDING_HR_APPROVAL };
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingHrLr);
      prisma.leaveRequest.update.mockResolvedValue({ ...pendingHrLr, status: LeaveRequestStatus.APPROVED });

      const result = await service.approveHr(1, hr as any);
      expect(result.status).toBe(LeaveRequestStatus.APPROVED);
    });
  });

  describe('cancel', () => {
    it('nguoi tao huy duoc khi con dang cho duyet (chua APPROVED)', async () => {
      const pendingManagerLr = { ...draftLr, status: LeaveRequestStatus.PENDING_MANAGER_APPROVAL };
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingManagerLr);
      prisma.leaveRequest.update.mockResolvedValue({ ...pendingManagerLr, status: LeaveRequestStatus.CANCELLED });

      const result = await service.cancel(1, employee as any);
      expect(result.status).toBe(LeaveRequestStatus.CANCELLED);
    });

    it('khong huy duoc khi da APPROVED', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({ ...draftLr, status: LeaveRequestStatus.APPROVED });

      await expect(service.cancel(1, employee as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('reject', () => {
    it('Truong bo phan tu choi o cap quan ly', async () => {
      const pendingManagerLr = { ...draftLr, status: LeaveRequestStatus.PENDING_MANAGER_APPROVAL };
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingManagerLr);
      prisma.leaveRequest.update.mockResolvedValue({ ...pendingManagerLr, status: LeaveRequestStatus.REJECTED });

      const result = await service.reject(1, { reason: 'Khong du nhan su' }, deptHead as any);
      expect(result.status).toBe(LeaveRequestStatus.REJECTED);
    });

    it('HR tu choi duoc o cap HR ma khong can kiem tra phong ban', async () => {
      const pendingHrLr = { ...draftLr, status: LeaveRequestStatus.PENDING_HR_APPROVAL };
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingHrLr);
      prisma.leaveRequest.update.mockResolvedValue({ ...pendingHrLr, status: LeaveRequestStatus.REJECTED });

      const result = await service.reject(1, { reason: 'Thieu chung tu' }, hr as any);
      expect(result.status).toBe(LeaveRequestStatus.REJECTED);
    });
  });
});
