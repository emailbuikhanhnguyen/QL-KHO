import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { GatePassRequestService } from './gate-pass-request.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', WAREHOUSE_STAFF: 'WAREHOUSE_STAFF', DEPT_HEAD: 'DEPT_HEAD', HR: 'HR', REQUESTER: 'REQUESTER' },
  GatePassRequestStatus: {
    DRAFT: 'DRAFT',
    PENDING_MANAGER_APPROVAL: 'PENDING_MANAGER_APPROVAL',
    PENDING_HR_APPROVAL: 'PENDING_HR_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
  },
}));

import { GatePassRequestStatus, Role } from '@prisma/client';

describe('GatePassRequestService', () => {
  let service: GatePassRequestService;
  let prisma: any;

  const employee = { id: 100, role: Role.REQUESTER, departmentId: 1 };
  const deptHead = { id: 200, role: Role.DEPT_HEAD, departmentId: 1 };
  const deptHeadOther = { id: 201, role: Role.DEPT_HEAD, departmentId: 2 };
  const hr = { id: 300, role: Role.HR, departmentId: 5 };
  const admin = { id: 1, role: Role.ADMIN, departmentId: 1 };

  const draftGp = {
    id: 1,
    code: 'GP-2026-000001',
    requestedBy: 100,
    departmentId: 1,
    status: GatePassRequestStatus.DRAFT,
    timeOut: '14:00',
    timeIn: '16:00',
  };

  beforeEach(async () => {
    prisma = {
      gatePassRequest: {
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
      providers: [GatePassRequestService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<GatePassRequestService>(GatePassRequestService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('tao thanh cong voi gio hop le', async () => {
      prisma.gatePassRequest.count.mockResolvedValue(0);
      prisma.gatePassRequest.create.mockResolvedValue(draftGp);

      const result = await service.create(
        { passDate: '2026-09-10', timeOut: '14:00', timeIn: '16:00', purpose: 'Gap khach hang' },
        employee as any,
      );

      expect(result).toEqual(draftGp);
      const createArg = prisma.gatePassRequest.create.mock.calls[0][0];
      expect(createArg.data.departmentId).toBe(1);
    });

    it('tao thanh cong KHONG can timeIn (ra ngoai khong quay lai)', async () => {
      prisma.gatePassRequest.count.mockResolvedValue(0);
      prisma.gatePassRequest.create.mockResolvedValue(draftGp);

      await expect(
        service.create({ passDate: '2026-09-10', timeOut: '17:00', purpose: 'Ve som' }, employee as any),
      ).resolves.toEqual(draftGp);
    });

    it('tu choi neu timeOut khong truoc timeIn', async () => {
      await expect(
        service.create({ passDate: '2026-09-10', timeOut: '16:00', timeIn: '14:00', purpose: 'x' }, employee as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('sinh ma dung dinh dang GP-{nam}-{so thu tu}', async () => {
      prisma.gatePassRequest.count.mockResolvedValue(9);
      prisma.gatePassRequest.create.mockResolvedValue(draftGp);

      await service.create({ passDate: '2026-09-10', timeOut: '14:00', purpose: 'x' }, employee as any);

      const createArg = prisma.gatePassRequest.create.mock.calls[0][0];
      expect(createArg.data.code).toMatch(/^GP-\d{4}-000010$/);
    });
  });

  describe('approveManager', () => {
    it('Truong bo phan CUNG phong ban duyet duoc', async () => {
      const pendingGp = { ...draftGp, status: GatePassRequestStatus.PENDING_MANAGER_APPROVAL };
      prisma.gatePassRequest.findUnique.mockResolvedValue(pendingGp);
      prisma.gatePassRequest.update.mockResolvedValue({ ...pendingGp, status: GatePassRequestStatus.PENDING_HR_APPROVAL });

      const result = await service.approveManager(1, deptHead as any);
      expect(result.status).toBe(GatePassRequestStatus.PENDING_HR_APPROVAL);
    });

    it('tu choi neu Truong bo phan KHAC phong ban', async () => {
      const pendingGp = { ...draftGp, status: GatePassRequestStatus.PENDING_MANAGER_APPROVAL };
      prisma.gatePassRequest.findUnique.mockResolvedValue(pendingGp);

      await expect(service.approveManager(1, deptHeadOther as any)).rejects.toThrow(ForbiddenException);
    });

    it('SoD: tu choi neu Truong bo phan tu dang ky ra/vao cong CHO CHINH MINH roi tu duyet', async () => {
      const ownGpByDeptHead = { ...draftGp, requestedBy: 200, departmentId: 1, status: GatePassRequestStatus.PENDING_MANAGER_APPROVAL };
      prisma.gatePassRequest.findUnique.mockResolvedValue(ownGpByDeptHead);

      await expect(service.approveManager(1, deptHead as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approveHr', () => {
    it('HR duyet xong chuyen APPROVED', async () => {
      const pendingHrGp = { ...draftGp, status: GatePassRequestStatus.PENDING_HR_APPROVAL };
      prisma.gatePassRequest.findUnique.mockResolvedValue(pendingHrGp);
      prisma.gatePassRequest.update.mockResolvedValue({ ...pendingHrGp, status: GatePassRequestStatus.APPROVED });

      const result = await service.approveHr(1, hr as any);
      expect(result.status).toBe(GatePassRequestStatus.APPROVED);
    });
  });

  describe('cancel / remove', () => {
    it('nguoi tao huy duoc khi dang cho duyet', async () => {
      const pendingGp = { ...draftGp, status: GatePassRequestStatus.PENDING_MANAGER_APPROVAL };
      prisma.gatePassRequest.findUnique.mockResolvedValue(pendingGp);
      prisma.gatePassRequest.update.mockResolvedValue({ ...pendingGp, status: GatePassRequestStatus.CANCELLED });

      const result = await service.cancel(1, employee as any);
      expect(result.status).toBe(GatePassRequestStatus.CANCELLED);
    });

    it('khong xoa duoc khi da qua DRAFT', async () => {
      prisma.gatePassRequest.findUnique.mockResolvedValue({ ...draftGp, status: GatePassRequestStatus.PENDING_MANAGER_APPROVAL });

      await expect(service.remove(1, employee as any)).rejects.toThrow(ConflictException);
    });

    it('Admin xoa duoc DRAFT du khong phai nguoi tao', async () => {
      prisma.gatePassRequest.findUnique.mockResolvedValue(draftGp);
      prisma.gatePassRequest.delete.mockResolvedValue(draftGp);

      await expect(service.remove(1, admin as any)).resolves.toEqual(draftGp);
    });
  });

  describe('reject', () => {
    it('tu choi o cap HR khong can kiem tra phong ban', async () => {
      const pendingHrGp = { ...draftGp, status: GatePassRequestStatus.PENDING_HR_APPROVAL };
      prisma.gatePassRequest.findUnique.mockResolvedValue(pendingHrGp);
      prisma.gatePassRequest.update.mockResolvedValue({ ...pendingHrGp, status: GatePassRequestStatus.REJECTED });

      const result = await service.reject(1, { reason: 'Khong hop ly' }, hr as any);
      expect(result.status).toBe(GatePassRequestStatus.REJECTED);
    });
  });
});
