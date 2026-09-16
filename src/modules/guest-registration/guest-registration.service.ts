import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../common/notification/notification.service';
import { CreateGuestRegistrationDto } from './dto/create-guest-registration.dto';
import { RejectGuestRegistrationDto } from './dto/reject-guest-registration.dto';
import { CheckInGuestDto } from './dto/check-in-guest.dto';
import { GuestRegistrationStatus, Prisma, Role } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

// Toi da so ngay duoc phep dang ky TRUOC ngay bat dau — theo dung xac
// nhan cua Sep Thanh, ap dung ban giay hien tai vao he thong.
const MAX_ADVANCE_DAYS = 2;

@Injectable()
export class GuestRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  async create(dto: CreateGuestRegistrationDto, currentUser: RequestUser) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (endDate < startDate) {
      throw new BadRequestException({ key: 'END_DATE_BEFORE_START_DATE' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxAllowedStart = new Date(today);
    maxAllowedStart.setDate(maxAllowedStart.getDate() + MAX_ADVANCE_DAYS);
    const startDateOnly = new Date(startDate);
    startDateOnly.setHours(0, 0, 0, 0);

    if (startDateOnly > maxAllowedStart) {
      throw new BadRequestException({ key: 'MAX_ADVANCE_DAYS_EXCEEDED' });
    }

    const code = await this.generateCode();

    return this.prisma.guestRegistration.create({
      data: {
        code,
        requestedBy: currentUser.id,
        departmentId: currentUser.departmentId,
        visitorFullName: dto.visitorFullName,
        idNumber: dto.idNumber,
        companyName: dto.companyName,
        purpose: dto.purpose,
        startDate,
        endDate,
        status: GuestRegistrationStatus.DRAFT,
        createdBy: currentUser.id,
      },
    });
  }

  async findAll(query: PaginationQueryDto & { status?: GuestRegistrationStatus; departmentId?: number }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.GuestRegistrationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.guestRegistration.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { department: true },
      }),
      this.prisma.guestRegistration.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.guestRegistration.findUnique({
      where: { id },
      include: { department: true, checkIns: { orderBy: { checkedInAt: 'desc' } } },
    });
    if (!found) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'GuestRegistration', id } });
    return this.attachUserNames(found);
  }

  // checkedInBy khong co quan he truc tiep toi User trong schema (giong
  // cach da lam voi Ho so dien tu) — gan ten hien thi bang 1 truy van gop.
  private async attachUserNames(reg: any) {
    const ids = new Set<number>([reg.requestedBy]);
    for (const c of reg.checkIns || []) ids.add(c.checkedInBy);

    const users = await this.prisma.user.findMany({ where: { id: { in: Array.from(ids) } } });
    const nameById = new Map(users.map((u: any) => [u.id, u.fullName]));

    return {
      ...reg,
      requestedByName: nameById.get(reg.requestedBy) || null,
      checkIns: (reg.checkIns || []).map((c: any) => ({ ...c, checkedInByName: nameById.get(c.checkedInBy) || null })),
    };
  }

  async remove(id: number, currentUser: RequestUser) {
    const reg = await this.findOne(id);
    this.assertStatus(reg, [GuestRegistrationStatus.DRAFT], 'xoa');
    this.assertOwner(reg, currentUser);
    return this.prisma.guestRegistration.delete({ where: { id } });
  }

  async submit(id: number, currentUser: RequestUser) {
    const reg = await this.findOne(id);
    this.assertStatus(reg, [GuestRegistrationStatus.DRAFT], 'gui duyet');
    this.assertOwner(reg, currentUser);

    const updated = await this.prisma.guestRegistration.update({
      where: { id },
      data: { status: GuestRegistrationStatus.PENDING_MANAGER_APPROVAL, submittedAt: new Date() },
    });

    await this.notifyDepartmentHead(reg.departmentId, reg.code);
    return updated;
  }

  async cancel(id: number, currentUser: RequestUser) {
    const reg = await this.findOne(id);
    this.assertStatus(reg, [GuestRegistrationStatus.DRAFT, GuestRegistrationStatus.PENDING_MANAGER_APPROVAL, GuestRegistrationStatus.PENDING_BOD_APPROVAL], 'huy');
    this.assertOwner(reg, currentUser);

    return this.prisma.guestRegistration.update({
      where: { id },
      data: { status: GuestRegistrationStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  // Duyet cap 1 (Quan ly) — giong dung pattern 6 module cu: chi Truong bo
  // phan CUNG phong ban, KHONG duoc tu duyet don cua chinh minh (SoD).
  async approveByManager(id: number, currentUser: RequestUser) {
    const reg = await this.findOne(id);
    this.assertStatus(reg, [GuestRegistrationStatus.PENDING_MANAGER_APPROVAL], 'duyet');

    const isAdmin = currentUser.role === Role.ADMIN;
    if (!isAdmin) {
      if (currentUser.role !== Role.DEPT_HEAD || currentUser.departmentId !== reg.departmentId) {
        throw new ForbiddenException({ key: 'NOT_YOUR_APPROVAL_STEP' });
      }
      if (reg.requestedBy === currentUser.id) {
        throw new ForbiddenException({ key: 'CANNOT_APPROVE_OWN_REQUEST' });
      }
    }

    const updated = await this.prisma.guestRegistration.update({
      where: { id },
      data: {
        status: GuestRegistrationStatus.PENDING_BOD_APPROVAL,
        managerApprovedBy: currentUser.id,
        managerApprovedAt: new Date(),
      },
    });

    const bodEmails = await this.notification.getEmailsByRole(Role.BOD);
    if (bodEmails.length) {
      await this.notification.sendToEmails(
        bodEmails,
        `[SEC ERP] Đăng ký khách ${reg.code} cần bạn duyệt`,
        `<p>Đăng ký khách <b>${reg.code}</b> (${reg.visitorFullName} — ${reg.companyName}) đã qua Quản lý, đang chờ BOD duyệt.</p>`,
      );
    }

    return updated;
  }

  // Duyet cap cuoi (BOD) — sau khi duyet xong, ho so co the tao QR de Bao
  // ve quet (xem generateCheckInPayload).
  async approveByBod(id: number, currentUser: RequestUser) {
    const reg = await this.findOne(id);
    this.assertStatus(reg, [GuestRegistrationStatus.PENDING_BOD_APPROVAL], 'duyet');

    if (currentUser.role !== Role.BOD && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException({ key: 'NOT_YOUR_APPROVAL_STEP' });
    }
    if (currentUser.role === Role.BOD && reg.requestedBy === currentUser.id) {
      throw new ForbiddenException({ key: 'CANNOT_APPROVE_OWN_REQUEST' });
    }

    const updated = await this.prisma.guestRegistration.update({
      where: { id },
      data: {
        status: GuestRegistrationStatus.APPROVED,
        bodApprovedBy: currentUser.id,
        bodApprovedAt: new Date(),
      },
    });

    const requesterEmail = await this.notification.getEmailByUserId(reg.requestedBy);
    if (requesterEmail) {
      await this.notification.sendToEmails(
        [requesterEmail],
        `[SEC ERP] Đăng ký khách ${reg.code} đã được duyệt`,
        `<p>Đăng ký khách <b>${reg.code}</b> (${reg.visitorFullName}) đã được duyệt xong. Có thể đưa mã QR cho khách hoặc bảo vệ để vào cổng.</p>`,
      );
    }

    return updated;
  }

  async reject(id: number, dto: RejectGuestRegistrationDto, currentUser: RequestUser) {
    const reg = await this.findOne(id);
    this.assertStatus(reg, [GuestRegistrationStatus.PENDING_MANAGER_APPROVAL, GuestRegistrationStatus.PENDING_BOD_APPROVAL], 'tu choi');

    const isAdmin = currentUser.role === Role.ADMIN;
    const isManagerStep = reg.status === GuestRegistrationStatus.PENDING_MANAGER_APPROVAL;
    if (!isAdmin) {
      if (isManagerStep && (currentUser.role !== Role.DEPT_HEAD || currentUser.departmentId !== reg.departmentId)) {
        throw new ForbiddenException({ key: 'NOT_YOUR_APPROVAL_STEP' });
      }
      if (!isManagerStep && currentUser.role !== Role.BOD) {
        throw new ForbiddenException({ key: 'NOT_YOUR_APPROVAL_STEP' });
      }
    }

    return this.prisma.guestRegistration.update({
      where: { id },
      data: {
        status: GuestRegistrationStatus.REJECTED,
        rejectedBy: currentUser.id,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
      },
    });
  }

  // ===========================================================================
  // CHECK-IN — Bao ve quet QR. Chi thuc hien duoc khi: da APPROVED, dung
  // vai tro GUARD (hoac Admin), va HOM NAY nam trong khoang [startDate,
  // endDate] da duyet. Cho phep NHIEU lan quet (khach ra vao nhieu lan).
  // ===========================================================================
  async checkIn(id: number, dto: CheckInGuestDto, currentUser: RequestUser) {
    const reg = await this.findOne(id);

    if (currentUser.role !== Role.GUARD && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException({ key: 'ONLY_GUARD_CAN_CHECK_IN' });
    }
    this.assertStatus(reg, [GuestRegistrationStatus.APPROVED], 'quet check-in');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(reg.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(reg.endDate);
    end.setHours(0, 0, 0, 0);

    if (today < start || today > end) {
      throw new BadRequestException({ key: 'CHECK_IN_OUTSIDE_APPROVED_RANGE' });
    }

    await this.prisma.guestCheckIn.create({
      data: {
        guestRegistrationId: id,
        checkedInBy: currentUser.id,
        notes: dto.notes,
      },
    });

    return this.findOne(id);
  }

  // Du lieu de FE ve ra QR (chi ma code — Bao ve quet duoc chuoi nay roi
  // FE tu goi API checkIn, khong nhung thong tin nhay cam vao QR).
  async getCheckInPayload(id: number) {
    const reg = await this.findOne(id);
    if (reg.status !== GuestRegistrationStatus.APPROVED) {
      throw new BadRequestException({ key: 'INVALID_STATUS_TRANSITION', params: { action: 'tao QR', status: reg.status } });
    }
    return { qrPayload: `GUEST_CHECKIN:${reg.id}:${reg.code}` };
  }

  private async notifyDepartmentHead(departmentId: number, code: string) {
    const heads = await this.prisma.user.findMany({
      where: { departmentId, role: Role.DEPT_HEAD, isActive: true, deletedAt: null },
    });
    if (heads.length) {
      await this.notification.sendToEmails(
        heads.map((h) => h.email),
        `[SEC ERP] Đăng ký khách ${code} cần bạn duyệt`,
        `<p>Có đăng ký khách/NCC mới (${code}) đang chờ bạn duyệt.</p>`,
      );
    }
  }

  private assertOwner(reg: { requestedBy: number }, currentUser: RequestUser) {
    if (currentUser.role !== Role.ADMIN && reg.requestedBy !== currentUser.id) {
      throw new ForbiddenException({ key: 'ONLY_OWNER_CAN_MODIFY' });
    }
  }

  private assertStatus(reg: { status: GuestRegistrationStatus }, allowed: GuestRegistrationStatus[], action: string) {
    if (!allowed.includes(reg.status)) {
      throw new ConflictException({ key: 'INVALID_STATUS_TRANSITION', params: { action, status: reg.status } });
    }
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.guestRegistration.count({ where: { code: { startsWith: `GR-${year}-` } } });
    const seq = String(count + 1).padStart(6, '0');
    return `GR-${year}-${seq}`;
  }
}
