import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OvertimeRequestService } from './overtime-request.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', DEPT_HEAD: 'DEPT_HEAD', HR: 'HR', REQUESTER: 'REQUESTER' },
  OvertimeRequestStatus: {
    DRAFT: 'DRAFT',
    PENDING_MANAGER_APPROVAL: 'PENDING_MANAGER_APPROVAL',
    PENDING_HR_APPROVAL: 'PENDING_HR_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
  },
}));

import { OvertimeRequestStatus, Role } from '@prisma/client';

describe('OvertimeRequestService', () => {
  let service: OvertimeRequestService;
  let prisma: any;

  const requester = { id: 100, role: Role.REQUESTER, departmentId: 1 };
  const deptHead = { id: 200, role: Role.DEPT_HEAD, departmentId: 1 };
  const deptHeadOther = { id: 201, role: Role.DEPT_HEAD, departmentId: 2 };
  const hr = { id: 300, role: Role.HR, departmentId: 5 };
  const admin = { id: 1, role: Role.ADMIN, departmentId: 1 };

  const draftOt = {
    id: 1,
    code: 'OT-2026-000001',
    departmentId: 1,
    requestedBy: 100,
    status: OvertimeRequestStatus.DRAFT,
    startTime: '18:00',
    endTime: '20:00',
  };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn() },
      overtimeRequest: {
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
      providers: [OvertimeRequestService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<OvertimeRequestService>(OvertimeRequestService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('tao thanh cong voi nhieu nhan vien tham gia', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 10, departmentId: 1 },
        { id: 11, departmentId: 1 },
      ]); // cung phong ban voi requester (departmentId: 1)
      prisma.overtimeRequest.count.mockResolvedValue(0);
      prisma.overtimeRequest.create.mockResolvedValue(draftOt);

      const result = await service.create(
        { otDate: '2026-09-10', startTime: '18:00', endTime: '20:00', reason: 'Gap don hang', userIds: [10, 11] },
        requester as any,
      );

      expect(result).toEqual(draftOt);
      const createArg = prisma.overtimeRequest.create.mock.calls[0][0];
      expect(createArg.data.departmentId).toBe(1);
      expect(createArg.data.lines.create).toEqual([{ userId: 10 }, { userId: 11 }]);
    });

    it('tu choi neu gio bat dau khong truoc gio ket thuc', async () => {
      await expect(
        service.create({ otDate: '2026-09-10', startTime: '20:00', endTime: '18:00', reason: 'x', userIds: [10] }, requester as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('tu choi neu co userId khong ton tai', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 10 }]); // chi tim thay 1/2 nguoi

      await expect(
        service.create({ otDate: '2026-09-10', startTime: '18:00', endTime: '20:00', reason: 'x', userIds: [10, 999] }, requester as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('tu choi neu chon nhan vien KHAC phong ban (khong phai Admin)', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 10, departmentId: 1 },
        { id: 11, departmentId: 2 }, // khac phong ban voi requester (departmentId: 1)
      ]);

      await expect(
        service.create({ otDate: '2026-09-10', startTime: '18:00', endTime: '20:00', reason: 'x', userIds: [10, 11] }, requester as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Admin duoc phep chon nhan vien khac phong ban', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 10, departmentId: 1 },
        { id: 11, departmentId: 2 },
      ]);
      prisma.overtimeRequest.count.mockResolvedValue(0);
      prisma.overtimeRequest.create.mockResolvedValue(draftOt);

      await expect(
        service.create({ otDate: '2026-09-10', startTime: '18:00', endTime: '20:00', reason: 'x', userIds: [10, 11] }, admin as any),
      ).resolves.toEqual(draftOt);
    });
  });

  describe('approveManager', () => {
    it('Truong bo phan CUNG phong ban duyet duoc', async () => {
      const pendingOt = { ...draftOt, status: OvertimeRequestStatus.PENDING_MANAGER_APPROVAL };
      prisma.overtimeRequest.findUnique.mockResolvedValue(pendingOt);
      prisma.overtimeRequest.update.mockResolvedValue({ ...pendingOt, status: OvertimeRequestStatus.PENDING_HR_APPROVAL });

      const result = await service.approveManager(1, deptHead as any);
      expect(result.status).toBe(OvertimeRequestStatus.PENDING_HR_APPROVAL);
    });

    it('tu choi neu Truong bo phan KHAC phong ban', async () => {
      const pendingOt = { ...draftOt, status: OvertimeRequestStatus.PENDING_MANAGER_APPROVAL };
      prisma.overtimeRequest.findUnique.mockResolvedValue(pendingOt);

      await expect(service.approveManager(1, deptHeadOther as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approveHr', () => {
    it('HR duyet xong chuyen APPROVED', async () => {
      const pendingHrOt = { ...draftOt, status: OvertimeRequestStatus.PENDING_HR_APPROVAL };
      prisma.overtimeRequest.findUnique.mockResolvedValue(pendingHrOt);
      prisma.overtimeRequest.update.mockResolvedValue({ ...pendingHrOt, status: OvertimeRequestStatus.APPROVED });

      const result = await service.approveHr(1, hr as any);
      expect(result.status).toBe(OvertimeRequestStatus.APPROVED);
    });
  });

  describe('cancel / remove', () => {
    it('nguoi tao huy duoc khi dang cho duyet', async () => {
      const pendingOt = { ...draftOt, status: OvertimeRequestStatus.PENDING_MANAGER_APPROVAL };
      prisma.overtimeRequest.findUnique.mockResolvedValue(pendingOt);
      prisma.overtimeRequest.update.mockResolvedValue({ ...pendingOt, status: OvertimeRequestStatus.CANCELLED });

      const result = await service.cancel(1, requester as any);
      expect(result.status).toBe(OvertimeRequestStatus.CANCELLED);
    });

    it('khong xoa duoc khi da qua DRAFT', async () => {
      prisma.overtimeRequest.findUnique.mockResolvedValue({ ...draftOt, status: OvertimeRequestStatus.PENDING_MANAGER_APPROVAL });

      await expect(service.remove(1, requester as any)).rejects.toThrow(ConflictException);
    });

    it('Admin xoa duoc DRAFT du khong phai nguoi tao', async () => {
      prisma.overtimeRequest.findUnique.mockResolvedValue(draftOt);
      prisma.overtimeRequest.delete.mockResolvedValue(draftOt);

      await expect(service.remove(1, admin as any)).resolves.toEqual(draftOt);
    });
  });

  describe('reject', () => {
    it('tu choi o cap HR khong can kiem tra phong ban', async () => {
      const pendingHrOt = { ...draftOt, status: OvertimeRequestStatus.PENDING_HR_APPROVAL };
      prisma.overtimeRequest.findUnique.mockResolvedValue(pendingHrOt);
      prisma.overtimeRequest.update.mockResolvedValue({ ...pendingHrOt, status: OvertimeRequestStatus.REJECTED });

      const result = await service.reject(1, { reason: 'Khong hop ly' }, hr as any);
      expect(result.status).toBe(OvertimeRequestStatus.REJECTED);
    });
  });
});
