import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MealRegistrationService } from './meal-registration.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', HR: 'HR', REQUESTER: 'REQUESTER', WAREHOUSE_STAFF: 'WAREHOUSE_STAFF' },
}));

import { Role } from '@prisma/client';

describe('MealRegistrationService', () => {
  let service: MealRegistrationService;
  let prisma: any;

  const employee = { id: 100, role: Role.REQUESTER, departmentId: 1 };
  const hr = { id: 300, role: Role.HR, departmentId: 5 };
  const admin = { id: 1, role: Role.ADMIN, departmentId: 1 };

  // "Hom nay" gia lap co dinh, cach xa qua khu/tuong lai de test on dinh
  const FAR_FUTURE = '2099-01-15';
  const FAR_PAST = '2000-01-15';

  beforeEach(async () => {
    prisma = {
      mealRegistration: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MealRegistrationService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<MealRegistrationService>(MealRegistrationService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('dang ky thanh cong cho ngay trong tuong lai', async () => {
      prisma.mealRegistration.upsert.mockResolvedValue({ id: 1, hasLunch: true, hasOvertimeMeal: false });

      const result = await service.register({ mealDate: FAR_FUTURE, hasLunch: true, hasOvertimeMeal: false }, employee as any);

      expect(result).toEqual({ id: 1, hasLunch: true, hasOvertimeMeal: false });
      const upsertArg = prisma.mealRegistration.upsert.mock.calls[0][0];
      expect(upsertArg.where.userId_mealDate.userId).toBe(100);
    });

    it('tu choi neu dang ky cho ngay da qua', async () => {
      await expect(service.register({ mealDate: FAR_PAST }, employee as any)).rejects.toThrow(BadRequestException);
    });

    it('mac dinh hasLunch=true, hasOvertimeMeal=false neu khong truyen', async () => {
      prisma.mealRegistration.upsert.mockResolvedValue({});
      await service.register({ mealDate: FAR_FUTURE }, employee as any);

      const upsertArg = prisma.mealRegistration.upsert.mock.calls[0][0];
      expect(upsertArg.create.hasLunch).toBe(true);
      expect(upsertArg.create.hasOvertimeMeal).toBe(false);
    });
  });

  describe('cancel', () => {
    it('huy thanh cong dang ky da co', async () => {
      prisma.mealRegistration.findUnique.mockResolvedValue({ id: 5 });
      prisma.mealRegistration.update.mockResolvedValue({ id: 5, cancelledAt: new Date() });

      const result = await service.cancel(FAR_FUTURE, employee as any);
      expect(result.id).toBe(5);
    });

    it('tu choi neu chua tung dang ky ngay do', async () => {
      prisma.mealRegistration.findUnique.mockResolvedValue(null);

      await expect(service.cancel(FAR_FUTURE, employee as any)).rejects.toThrow(NotFoundException);
    });

    it('tu choi neu huy cho ngay da qua', async () => {
      await expect(service.cancel(FAR_PAST, employee as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSummary', () => {
    it('HR xem duoc bao cao tong hop', async () => {
      prisma.mealRegistration.findMany.mockResolvedValue([
        { hasLunch: true, hasOvertimeMeal: false, departmentId: 1, department: { name: 'PMC' } },
        { hasLunch: true, hasOvertimeMeal: true, departmentId: 1, department: { name: 'PMC' } },
        { hasLunch: false, hasOvertimeMeal: true, departmentId: 2, department: { name: 'CS' } },
      ]);

      const result = await service.getSummary(FAR_FUTURE, hr as any);

      expect(result.totalLunch).toBe(2);
      expect(result.totalOvertimeMeal).toBe(2);
      expect(result.byDepartment).toHaveLength(2);
    });

    it('Admin cung xem duoc', async () => {
      prisma.mealRegistration.findMany.mockResolvedValue([]);
      await expect(service.getSummary(FAR_FUTURE, admin as any)).resolves.toBeDefined();
    });

    it('nhan vien thuong KHONG xem duoc bao cao tong hop', async () => {
      await expect(service.getSummary(FAR_FUTURE, employee as any)).rejects.toThrow(ForbiddenException);
    });
  });
});
