import { Test, TestingModule } from '@nestjs/testing';
import { MyApprovalsService } from './my-approvals.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: {
    ADMIN: 'ADMIN', DEPT_HEAD: 'DEPT_HEAD', HR: 'HR', BOD: 'BOD',
    ACCOUNTANT: 'ACCOUNTANT', PURCHASER: 'PURCHASER', REQUESTER: 'REQUESTER',
  },
}));

import { Role } from '@prisma/client';

describe('MyApprovalsService', () => {
  let service: MyApprovalsService;
  let prisma: any;

  const deptHead = { id: 200, role: Role.DEPT_HEAD, departmentId: 1 };
  const hr = { id: 300, role: Role.HR, departmentId: 5 };
  const bod = { id: 400, role: Role.BOD, departmentId: 6 };
  const accountant = { id: 500, role: Role.ACCOUNTANT, departmentId: 7 };
  const admin = { id: 1, role: Role.ADMIN, departmentId: 1 };
  const plainEmployee = { id: 100, role: Role.REQUESTER, departmentId: 1 };

  // Moi model deu tra ve [] mac dinh — tung test se ghi de model can kiem tra.
  function emptyModel() {
    return { findMany: jest.fn().mockResolvedValue([]) };
  }

  beforeEach(async () => {
    prisma = {
      leaveRequest: emptyModel(),
      overtimeRequest: emptyModel(),
      gatePassRequest: emptyModel(),
      vehicleBookingRequest: emptyModel(),
      purchaseRequisition: emptyModel(),
      purchaseRequest: emptyModel(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MyApprovalsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<MyApprovalsService>(MyApprovalsService);
    jest.clearAllMocks();
  });

  describe('Phan quyen theo vai tro', () => {
    it('Nhan vien thuong: KHONG co viec nao can duyet', async () => {
      const result = await service.getMyApprovals(plainEmployee as any);

      expect(result).toEqual([]);
      // khong duoc goi bat ky truy van nao — nhan vien thuong khong duyet gi ca
      expect(prisma.leaveRequest.findMany).not.toHaveBeenCalled();
      expect(prisma.purchaseRequest.findMany).not.toHaveBeenCalled();
    });

    it('Truong bo phan: chi thay phieu cap QUAN LY, dung phong ban minh', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([
        { id: 1, reason: 'Nghi om', submittedAt: new Date('2026-09-01'), department: { name: 'PMC' } },
      ]);

      const result = await service.getMyApprovals(deptHead as any);

      expect(result).toHaveLength(1);
      expect(result[0].stage).toBe('MANAGER');
      expect(result[0].module).toBe('leave');

      // Xac nhan loc dung phong ban + KHONG lay phieu do chinh minh tao (SoD)
      const where = prisma.leaveRequest.findMany.mock.calls[0][0].where;
      expect(where.departmentId).toBe(1);
      expect(where.NOT).toEqual({ requestedBy: 200 });
    });

    it('HR: chi thay cap CUOI cua Nghi phep/Tang ca/Ra-vao cong, KHONG thay Xe cong vu', async () => {
      await service.getMyApprovals(hr as any);

      // HR duyet cap cuoi 3 module nay
      expect(prisma.leaveRequest.findMany).toHaveBeenCalled();
      expect(prisma.overtimeRequest.findMany).toHaveBeenCalled();
      expect(prisma.gatePassRequest.findMany).toHaveBeenCalled();
      // Xe cong vu cap cuoi la ADMIN, khong phai HR
      expect(prisma.vehicleBookingRequest.findMany).not.toHaveBeenCalled();
    });

    it('BOD: thay Yeu cau mua hang cho duyet cap cuoi', async () => {
      prisma.purchaseRequisition.findMany.mockResolvedValue([
        { id: 9, code: 'PRQ-2026-000009', reason: 'Mua vat tu', submittedAt: new Date(), department: { name: 'PMC' } },
      ]);

      const result = await service.getMyApprovals(bod as any);

      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('PRQ-2026-000009');
      expect(result[0].stage).toBe('FINAL');
    });

    it('Ke toan: thay PR co gia cho duyet cap cuoi', async () => {
      prisma.purchaseRequest.findMany.mockResolvedValue([
        {
          id: 5, code: 'PR-2026-000005', totalAmountUsd: 2500, submittedAt: new Date(),
          purchaseRequisition: { department: { name: 'PMC' } },
        },
      ]);

      const result = await service.getMyApprovals(accountant as any);

      expect(result).toHaveLength(1);
      expect(result[0].module).toBe('pricedpr');
      expect(result[0].title).toContain('2500');
    });

    it('Admin: thay TAT CA, va KHONG bi loc theo phong ban', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      await service.getMyApprovals(admin as any);

      // Admin goi ca 6 model
      expect(prisma.leaveRequest.findMany).toHaveBeenCalled();
      expect(prisma.vehicleBookingRequest.findMany).toHaveBeenCalled();
      expect(prisma.purchaseRequest.findMany).toHaveBeenCalled();

      // where cap quan ly cua Admin phai RONG (khong loc phong ban)
      const where = prisma.leaveRequest.findMany.mock.calls[0][0].where;
      expect(where.departmentId).toBeUndefined();
      expect(where.NOT).toBeUndefined();
    });
  });

  describe('Gom va sap xep', () => {
    it('gom nhieu module vao 1 danh sach, phieu cho LAU NHAT len dau', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([
        { id: 1, reason: 'Moi gui', submittedAt: new Date('2026-09-05'), department: { name: 'PMC' } },
      ]);
      prisma.gatePassRequest.findMany.mockResolvedValue([
        { id: 2, code: 'GP-2026-000002', purpose: 'Cho lau nhat', submittedAt: new Date('2026-09-01'), department: { name: 'PMC' } },
      ]);

      const result = await service.getMyApprovals(deptHead as any);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Cho lau nhat'); // cu nhat len dau
      expect(result[1].title).toBe('Moi gui');
    });

    it('Xe cong vu: title ghep diem di -> diem den', async () => {
      prisma.vehicleBookingRequest.findMany.mockResolvedValue([
        { id: 3, code: 'VB-2026-000003', departure: 'Cong ty', destination: 'San bay', submittedAt: new Date(), department: { name: 'PMC' } },
      ]);

      const result = await service.getMyApprovals(deptHead as any);

      expect(result[0].title).toBe('Cong ty → San bay');
    });
  });

  describe('countMyApprovals', () => {
    it('tra ve dung tong so viec can duyet', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([
        { id: 1, reason: 'a', submittedAt: new Date(), department: { name: 'PMC' } },
        { id: 2, reason: 'b', submittedAt: new Date(), department: { name: 'PMC' } },
      ]);

      const result = await service.countMyApprovals(deptHead as any);
      expect(result).toEqual({ count: 2 });
    });

    it('nhan vien thuong: count = 0', async () => {
      const result = await service.countMyApprovals(plainEmployee as any);
      expect(result).toEqual({ count: 0 });
    });
  });
});
