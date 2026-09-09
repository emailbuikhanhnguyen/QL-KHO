import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { VehicleBookingRequestService } from './vehicle-booking-request.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', DEPT_HEAD: 'DEPT_HEAD', REQUESTER: 'REQUESTER' },
  VehicleBookingStatus: {
    DRAFT: 'DRAFT',
    PENDING_MANAGER_APPROVAL: 'PENDING_MANAGER_APPROVAL',
    PENDING_ADMIN_APPROVAL: 'PENDING_ADMIN_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
  },
}));

import { VehicleBookingStatus, Role } from '@prisma/client';

describe('VehicleBookingRequestService', () => {
  let service: VehicleBookingRequestService;
  let prisma: any;

  const requester = { id: 100, role: Role.REQUESTER, departmentId: 1 };
  const deptHead = { id: 200, role: Role.DEPT_HEAD, departmentId: 1 };
  const deptHeadOther = { id: 201, role: Role.DEPT_HEAD, departmentId: 2 };
  const admin = { id: 1, role: Role.ADMIN, departmentId: 1 };

  const draftVb = {
    id: 1,
    code: 'VB-2026-000001',
    departmentId: 1,
    requestedBy: 100,
    status: VehicleBookingStatus.DRAFT,
    startTime: '08:00',
    endTime: '10:00',
  };

  beforeEach(async () => {
    prisma = {
      vehicleBookingRequest: {
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
      providers: [VehicleBookingRequestService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<VehicleBookingRequestService>(VehicleBookingRequestService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('tao thanh cong voi gio hop le', async () => {
      prisma.vehicleBookingRequest.count.mockResolvedValue(0);
      prisma.vehicleBookingRequest.create.mockResolvedValue(draftVb);

      const result = await service.create(
        {
          useDate: '2026-09-10',
          startTime: '08:00',
          endTime: '10:00',
          departure: 'Cong ty',
          destination: 'San bay',
          purpose: 'Don khach',
          numberOfPeople: 2,
        },
        requester as any,
      );

      expect(result).toEqual(draftVb);
      const createArg = prisma.vehicleBookingRequest.create.mock.calls[0][0];
      expect(createArg.data.departmentId).toBe(1);
    });

    it('tu choi neu gio bat dau khong truoc gio ket thuc', async () => {
      await expect(
        service.create(
          { useDate: '2026-09-10', startTime: '10:00', endTime: '08:00', departure: 'A', destination: 'B', purpose: 'x', numberOfPeople: 1 },
          requester as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('sinh ma dung dinh dang VB-{nam}-{so thu tu}', async () => {
      prisma.vehicleBookingRequest.count.mockResolvedValue(2);
      prisma.vehicleBookingRequest.create.mockResolvedValue(draftVb);

      await service.create(
        { useDate: '2026-09-10', startTime: '08:00', endTime: '10:00', departure: 'A', destination: 'B', purpose: 'x', numberOfPeople: 1 },
        requester as any,
      );

      const createArg = prisma.vehicleBookingRequest.create.mock.calls[0][0];
      expect(createArg.data.code).toMatch(/^VB-\d{4}-000003$/);
    });
  });

  describe('approveManager', () => {
    it('Truong bo phan CUNG phong ban duyet duoc, chuyen PENDING_ADMIN_APPROVAL', async () => {
      const pendingVb = { ...draftVb, status: VehicleBookingStatus.PENDING_MANAGER_APPROVAL };
      prisma.vehicleBookingRequest.findUnique.mockResolvedValue(pendingVb);
      prisma.vehicleBookingRequest.update.mockResolvedValue({ ...pendingVb, status: VehicleBookingStatus.PENDING_ADMIN_APPROVAL });

      const result = await service.approveManager(1, deptHead as any);
      expect(result.status).toBe(VehicleBookingStatus.PENDING_ADMIN_APPROVAL);
    });

    it('tu choi neu Truong bo phan KHAC phong ban', async () => {
      const pendingVb = { ...draftVb, status: VehicleBookingStatus.PENDING_MANAGER_APPROVAL };
      prisma.vehicleBookingRequest.findUnique.mockResolvedValue(pendingVb);

      await expect(service.approveManager(1, deptHeadOther as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approveAdmin', () => {
    it('Admin duyet xong chuyen APPROVED (khong phai HR)', async () => {
      const pendingAdminVb = { ...draftVb, status: VehicleBookingStatus.PENDING_ADMIN_APPROVAL };
      prisma.vehicleBookingRequest.findUnique.mockResolvedValue(pendingAdminVb);
      prisma.vehicleBookingRequest.update.mockResolvedValue({ ...pendingAdminVb, status: VehicleBookingStatus.APPROVED });

      const result = await service.approveAdmin(1, admin as any);
      expect(result.status).toBe(VehicleBookingStatus.APPROVED);
    });

    it('khong duyet duoc khi chua qua Quan ly (van con DRAFT)', async () => {
      prisma.vehicleBookingRequest.findUnique.mockResolvedValue(draftVb);

      await expect(service.approveAdmin(1, admin as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('cancel / remove', () => {
    it('nguoi tao huy duoc khi dang cho duyet', async () => {
      const pendingVb = { ...draftVb, status: VehicleBookingStatus.PENDING_MANAGER_APPROVAL };
      prisma.vehicleBookingRequest.findUnique.mockResolvedValue(pendingVb);
      prisma.vehicleBookingRequest.update.mockResolvedValue({ ...pendingVb, status: VehicleBookingStatus.CANCELLED });

      const result = await service.cancel(1, requester as any);
      expect(result.status).toBe(VehicleBookingStatus.CANCELLED);
    });

    it('khong xoa duoc khi da qua DRAFT', async () => {
      prisma.vehicleBookingRequest.findUnique.mockResolvedValue({ ...draftVb, status: VehicleBookingStatus.PENDING_MANAGER_APPROVAL });

      await expect(service.remove(1, requester as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('reject', () => {
    it('Admin tu choi duoc o cap admin', async () => {
      const pendingAdminVb = { ...draftVb, status: VehicleBookingStatus.PENDING_ADMIN_APPROVAL };
      prisma.vehicleBookingRequest.findUnique.mockResolvedValue(pendingAdminVb);
      prisma.vehicleBookingRequest.update.mockResolvedValue({ ...pendingAdminVb, status: VehicleBookingStatus.REJECTED });

      const result = await service.reject(1, { reason: 'Khong co xe trong' }, admin as any);
      expect(result.status).toBe(VehicleBookingStatus.REJECTED);
    });
  });
});
