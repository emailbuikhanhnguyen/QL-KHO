import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterMealDto } from './dto/register-meal.dto';
import { Role } from '@prisma/client';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

@Injectable()
export class MealRegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  // Dang ky hoac cap nhat dang ky cho 1 ngay cu the — dung upsert theo
  // unique (userId, mealDate) de khong tao trung ban ghi.
  async register(dto: RegisterMealDto, currentUser: RequestUser) {
    const mealDate = new Date(dto.mealDate);
    this.assertNotPast(mealDate);

    return this.prisma.mealRegistration.upsert({
      where: { userId_mealDate: { userId: currentUser.id, mealDate } },
      create: {
        userId: currentUser.id,
        departmentId: currentUser.departmentId,
        mealDate,
        hasLunch: dto.hasLunch ?? true,
        hasOvertimeMeal: dto.hasOvertimeMeal ?? false,
      },
      update: {
        hasLunch: dto.hasLunch ?? true,
        hasOvertimeMeal: dto.hasOvertimeMeal ?? false,
        cancelledAt: null, // dang ky lai neu truoc do da huy
      },
    });
  }

  async cancel(mealDate: string, currentUser: RequestUser) {
    const date = new Date(mealDate);
    this.assertNotPast(date);

    const existing = await this.prisma.mealRegistration.findUnique({
      where: { userId_mealDate: { userId: currentUser.id, mealDate: date } },
    });
    if (!existing) {
      throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'MealRegistration', id: mealDate } });
    }

    return this.prisma.mealRegistration.update({
      where: { id: existing.id },
      data: { cancelledAt: new Date() },
    });
  }

  async findMine(currentUser: RequestUser, fromDate?: string, toDate?: string) {
    return this.prisma.mealRegistration.findMany({
      where: {
        userId: currentUser.id,
        ...(fromDate || toDate
          ? {
              mealDate: {
                ...(fromDate ? { gte: new Date(fromDate) } : {}),
                ...(toDate ? { lte: new Date(toDate) } : {}),
              },
            }
          : {}),
      },
      orderBy: { mealDate: 'desc' },
    });
  }

  // Chi HR/Admin xem duoc — tong hop so luong suat an theo ngay, de bao NCC.
  async getSummary(date: string, currentUser: RequestUser) {
    if (currentUser.role !== Role.ADMIN && currentUser.role !== Role.HR) {
      throw new ForbiddenException({ key: 'FORBIDDEN_ROLE' });
    }

    const mealDate = new Date(date);
    const registrations = await this.prisma.mealRegistration.findMany({
      where: { mealDate, cancelledAt: null },
      include: { department: true },
    });

    const totalLunch = registrations.filter((r) => r.hasLunch).length;
    const totalOvertimeMeal = registrations.filter((r) => r.hasOvertimeMeal).length;

    const byDepartmentMap = new Map<number, { departmentName: string; lunch: number; overtimeMeal: number }>();
    for (const r of registrations) {
      const key = r.departmentId;
      if (!byDepartmentMap.has(key)) {
        byDepartmentMap.set(key, { departmentName: r.department.name, lunch: 0, overtimeMeal: 0 });
      }
      const entry = byDepartmentMap.get(key)!;
      if (r.hasLunch) entry.lunch++;
      if (r.hasOvertimeMeal) entry.overtimeMeal++;
    }

    return {
      date,
      totalLunch,
      totalOvertimeMeal,
      byDepartment: Array.from(byDepartmentMap.values()),
    };
  }

  private assertNotPast(date: Date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      throw new BadRequestException({ key: 'MEAL_DATE_IN_PAST' });
    }
  }
}
