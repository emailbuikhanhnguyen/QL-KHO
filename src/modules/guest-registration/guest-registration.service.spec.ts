import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { GuestRegistrationService } from './guest-registration.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../common/notification/notification.service';

jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', DEPT_HEAD: 'DEPT_HEAD', BOD: 'BOD', GUARD: 'GUARD', REQUESTER: 'REQUESTER' },
  GuestRegistrationStatus: {
    DRAFT: 'DRAFT', PENDING_MANAGER_APPROVAL: 'PENDING_MANAGER_APPROVAL', PENDING_BOD_APPROVAL: 'PENDING_BOD_APPROVAL',
    APPROVED: 'APPROVED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED',
  },
}));

import { GuestRegistrationStatus, Role } from '@prisma/client';

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const oneVisitor = [{ fullName: 'Nguyen Van A', idNumber: '079123456789' }];

describe('GuestRegistrationService', () => {
  let service: GuestRegistrationService;
  let prisma: any;
  let notification: any;

  const employee = { id: 100, role: Role.REQUESTER, departmentId: 1 };
  const deptHead = { id: 200, role: Role.DEPT_HEAD, departmentId: 1 };
  const otherDeptHead = { id: 201, role: Role.DEPT_HEAD, departmentId: 2 };
  const bod = { id: 300, role: Role.BOD, departmentId: 1 };
  const guard = { id: 400, role: Role.GUARD, departmentId: 1 };
  const admin = { id: 1, role: Role.ADMIN, departmentId: 1 };

  // Them 17/09/2026: khop mau giay that (SECI-CSR-ARFSOP008-2) — 1 phieu
  // co the co NHIEU nguoi (bang con GuestVisitor), khong con 1 truong
  // visitorFullName/idNumber don le nhu ban truoc.
  const baseReg = {
    id: 1,
    code: 'GR-2026-000001',
    requestedBy: 100,
    departmentId: 1,
    companyName: 'NCC ABC',
    purpose: 'Sua chua may han',
    status: GuestRegistrationStatus.DRAFT,
    startDate: new Date(daysFromNow(1)),
    endDate: new Date(daysFromNow(2)),
    visitors: [{ id: 1, fullName: 'Nguyen Van A', idNumber: '079123456789' }],
    checkIns: [],
  };

  beforeEach(async () => {
    prisma = {
      guestRegistration: {
        create: jest.fn((args: any) => Promise.resolve({ ...baseReg, ...args.data, visitors: args.data.visitors?.create || baseReg.visitors })),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn((args: any) => Promise.resolve({ ...baseReg, ...args.data })),
        delete: jest.fn(),
      },
      guestCheckIn: { create: jest.fn() },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 200, email: 'head@sec.com', fullName: 'Head PMC' }]),
      },
      $transaction: jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    notification = {
      getEmailsByRole: jest.fn().mockResolvedValue(['bod@sec.com']),
      getEmailByUserId: jest.fn().mockResolvedValue('someone@sec.com'),
      sendToEmails: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestRegistrationService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notification },
      ],
    }).compile();

    service = module.get<GuestRegistrationService>(GuestRegistrationService);
    jest.clearAllMocks();
    prisma.guestRegistration.findUnique.mockResolvedValue(baseReg);
  });

  describe('create — ho tro NHIEU nguoi/phieu (khop mau giay that)', () => {
    it('tao duoc voi 1 nguoi, ngay bat dau trong pham vi 2 ngay', async () => {
      const dto = { companyName: 'B', purpose: 'Bao tri', visitors: oneVisitor, startDate: daysFromNow(2), endDate: daysFromNow(3) };
      await expect(service.create(dto as any, employee as any)).resolves.toBeDefined();
    });

    it('tao duoc voi NHIEU nguoi trong CUNG 1 phieu (toi da 10 theo mau giay)', async () => {
      const visitors = Array.from({ length: 5 }, (_, i) => ({ fullName: `Nguoi ${i + 1}`, idNumber: `07900000${i}` }));
      const dto = { companyName: 'Cty XYZ', purpose: 'Bao tri he thong dien', visitors, startDate: daysFromNow(1), endDate: daysFromNow(2) };

      await service.create(dto as any, employee as any);

      const createArg = prisma.guestRegistration.create.mock.calls[0][0];
      expect(createArg.data.visitors.create).toHaveLength(5);
      expect(createArg.data.visitors.create[2]).toEqual(expect.objectContaining({ fullName: 'Nguoi 3', idNumber: '079000002' }));
    });

    it('luu duoc thong tin nguoi lien he phia NCC (contactPersonName/Phone)', async () => {
      const dto = {
        companyName: 'B', purpose: 'Bao tri', visitors: oneVisitor,
        contactPersonName: 'Tran Van B', contactPersonPhone: '0909123456',
        startDate: daysFromNow(1), endDate: daysFromNow(2),
      };
      await service.create(dto as any, employee as any);
      const createArg = prisma.guestRegistration.create.mock.calls[0][0];
      expect(createArg.data.contactPersonName).toBe('Tran Van B');
      expect(createArg.data.contactPersonPhone).toBe('0909123456');
    });

    it('BAO LOI ro rang neu dang ky truoc QUA 2 ngay', async () => {
      const dto = { companyName: 'B', purpose: 'Bao tri', visitors: oneVisitor, startDate: daysFromNow(3), endDate: daysFromNow(4) };
      await expect(service.create(dto as any, employee as any)).rejects.toThrow(BadRequestException);
    });

    it('bao loi neu ngay ket thuc truoc ngay bat dau', async () => {
      const dto = { companyName: 'B', purpose: 'Bao tri', visitors: oneVisitor, startDate: daysFromNow(1), endDate: daysFromNow(0) };
      await expect(service.create(dto as any, employee as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveByManager — 2 cap co dinh, giong 6 module cu', () => {
    const pendingReg = { ...baseReg, status: GuestRegistrationStatus.PENDING_MANAGER_APPROVAL };

    beforeEach(() => {
      prisma.guestRegistration.findUnique.mockResolvedValue(pendingReg);
    });

    it('Truong bo phan DUNG phong ban duyet duoc, chuyen sang PENDING_BOD_APPROVAL', async () => {
      const result = await service.approveByManager(1, deptHead as any);
      expect(result.status).toBe(GuestRegistrationStatus.PENDING_BOD_APPROVAL);
      expect(notification.sendToEmails).toHaveBeenCalledWith(['bod@sec.com'], expect.any(String), expect.any(String));
    });

    it('Truong bo phan KHAC phong ban KHONG duyet duoc', async () => {
      await expect(service.approveByManager(1, otherDeptHead as any)).rejects.toThrow(ForbiddenException);
    });

    it('KHONG tu duyet duoc don cua chinh minh (SoD)', async () => {
      const ownReg = { ...pendingReg, requestedBy: 200 };
      prisma.guestRegistration.findUnique.mockResolvedValue(ownReg);
      await expect(service.approveByManager(1, deptHead as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approveByBod — cap cuoi', () => {
    it('BOD duyet xong chuyen APPROVED, bao email nguoi tao', async () => {
      const reg = { ...baseReg, status: GuestRegistrationStatus.PENDING_BOD_APPROVAL };
      prisma.guestRegistration.findUnique.mockResolvedValue(reg);

      const result = await service.approveByBod(1, bod as any);
      expect(result.status).toBe(GuestRegistrationStatus.APPROVED);
    });

    it('Truong bo phan KHONG duoc duyet cap BOD', async () => {
      const reg = { ...baseReg, status: GuestRegistrationStatus.PENDING_BOD_APPROVAL };
      prisma.guestRegistration.findUnique.mockResolvedValue(reg);
      await expect(service.approveByBod(1, deptHead as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('checkIn — Bao ve quet QR (xac nhan CA DOAN, dung 1 lan quet cho ca nhom)', () => {
    // startDate = hom nay (khac baseReg dung ngay mai) — dung rieng cho
    // nhom test nay vi can "hom nay" NAM TRONG khoang duoc duyet.
    const approvedReg = { ...baseReg, status: GuestRegistrationStatus.APPROVED, startDate: new Date(daysFromNow(0)), endDate: new Date(daysFromNow(1)) };

    it('Bao ve quet duoc khi da APPROVED va hom nay trong khoang ngay', async () => {
      prisma.guestRegistration.findUnique.mockResolvedValue(approvedReg);
      await service.checkIn(1, {}, guard as any);
      expect(prisma.guestCheckIn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ guestRegistrationId: 1, checkedInBy: 400 }) }),
      );
    });

    it('KHONG phai Bao ve thi khong quet duoc (dung ca REQUESTER thuong)', async () => {
      prisma.guestRegistration.findUnique.mockResolvedValue(approvedReg);
      await expect(service.checkIn(1, {}, employee as any)).rejects.toThrow(ForbiddenException);
    });

    it('chua duoc APPROVED thi khong quet duoc', async () => {
      const draftReg = { ...baseReg, status: GuestRegistrationStatus.DRAFT };
      prisma.guestRegistration.findUnique.mockResolvedValue(draftReg);
      await expect(service.checkIn(1, {}, guard as any)).rejects.toThrow(ConflictException);
    });

    it('BAO LOI neu hom nay nam NGOAI khoang ngay da duyet', async () => {
      const outOfRangeReg = { ...approvedReg, startDate: new Date(daysFromNow(5)), endDate: new Date(daysFromNow(6)) };
      prisma.guestRegistration.findUnique.mockResolvedValue(outOfRangeReg);
      await expect(service.checkIn(1, {}, guard as any)).rejects.toThrow(BadRequestException);
    });

    it('cho phep quet NHIEU LAN (khach ra vao nhieu lan trong khoang ngay)', async () => {
      prisma.guestRegistration.findUnique.mockResolvedValue(approvedReg);
      await service.checkIn(1, { notes: 'Lan 1' }, guard as any);
      await service.checkIn(1, { notes: 'Lan 2' }, guard as any);
      expect(prisma.guestCheckIn.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCheckInPayload', () => {
    it('chi tao duoc QR khi da APPROVED', async () => {
      const draftReg = { ...baseReg, status: GuestRegistrationStatus.DRAFT };
      prisma.guestRegistration.findUnique.mockResolvedValue(draftReg);
      await expect(service.getCheckInPayload(1)).rejects.toThrow(BadRequestException);
    });

    it('tra ve dung payload chua ma code', async () => {
      const approvedReg = { ...baseReg, status: GuestRegistrationStatus.APPROVED };
      prisma.guestRegistration.findUnique.mockResolvedValue(approvedReg);
      const result = await service.getCheckInPayload(1);
      expect(result.qrPayload).toContain('GR-2026-000001');
    });
  });
});
