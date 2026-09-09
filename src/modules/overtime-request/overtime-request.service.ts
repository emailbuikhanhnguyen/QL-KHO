import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOvertimeRequestDto } from './dto/create-overtime-request.dto';
import { RejectOvertimeRequestDto } from './dto/reject-overtime-request.dto';
import { OvertimeRequestStatus, Prisma, Role } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

@Injectable()
export class OvertimeRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOvertimeRequestDto, currentUser: RequestUser) {
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException({ key: 'INVALID_TIME_RANGE' });
    }

    const users = await this.prisma.user.findMany({ where: { id: { in: dto.userIds }, deletedAt: null } });
    if (users.length !== dto.userIds.length) {
      throw new BadRequestException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'User', id: 'trong danh sach userIds' } });
    }

    // Kiem tra tat ca nhan vien duoc chon deu thuoc DUNG phong ban cua
    // nguoi tao don — 1 bo phan khong duoc tu y dang ky tang ca cho nhan
    // vien phong ban khac (tru Admin, phong ho tro/xu ly ngoai le).
    if (currentUser.role !== Role.ADMIN) {
      const outsideDept = users.filter((u) => u.departmentId !== currentUser.departmentId);
      if (outsideDept.length > 0) {
        throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
      }
    }

    const code = await this.generateCode();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.overtimeRequest.create({
        data: {
          code,
          departmentId: currentUser.departmentId,
          otDate: new Date(dto.otDate),
          startTime: dto.startTime,
          endTime: dto.endTime,
          reason: dto.reason,
          status: OvertimeRequestStatus.DRAFT,
          requestedBy: currentUser.id,
          createdBy: currentUser.id,
          lines: { create: dto.userIds.map((userId) => ({ userId })) },
        },
        include: { lines: true },
      });
      return created;
    });
  }

  async findAll(query: PaginationQueryDto & { status?: OvertimeRequestStatus; departmentId?: number }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.OvertimeRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.overtimeRequest.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { department: true, lines: true },
      }),
      this.prisma.overtimeRequest.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.overtimeRequest.findUnique({
      where: { id },
      include: { department: true, lines: true },
    });
    if (!found) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'OvertimeRequest', id } });
    return found;
  }

  async remove(id: number, currentUser: RequestUser) {
    const ot = await this.findOne(id);
    this.assertStatus(ot, [OvertimeRequestStatus.DRAFT], 'xoa');
    this.assertOwner(ot, currentUser);
    return this.prisma.overtimeRequest.delete({ where: { id } });
  }

  async submit(id: number, currentUser: RequestUser) {
    const ot = await this.findOne(id);
    this.assertStatus(ot, [OvertimeRequestStatus.DRAFT], 'gui duyet');
    this.assertOwner(ot, currentUser);

    return this.prisma.overtimeRequest.update({
      where: { id },
      data: { status: OvertimeRequestStatus.PENDING_MANAGER_APPROVAL, submittedAt: new Date(), updatedBy: currentUser.id },
    });
  }

  async cancel(id: number, currentUser: RequestUser) {
    const ot = await this.findOne(id);
    this.assertStatus(
      ot,
      [OvertimeRequestStatus.DRAFT, OvertimeRequestStatus.PENDING_MANAGER_APPROVAL, OvertimeRequestStatus.PENDING_HR_APPROVAL],
      'huy',
    );
    this.assertOwner(ot, currentUser);

    return this.prisma.overtimeRequest.update({
      where: { id },
      data: { status: OvertimeRequestStatus.CANCELLED, cancelledAt: new Date(), updatedBy: currentUser.id },
    });
  }

  async approveManager(id: number, currentUser: RequestUser) {
    const ot = await this.findOne(id);
    this.assertStatus(ot, [OvertimeRequestStatus.PENDING_MANAGER_APPROVAL], 'duyet quan ly');

    if (currentUser.role !== Role.ADMIN && ot.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }

    // Them 09/09/2026 — vay lo hong Separation of Duties (SoD), xem giai
    // thich chi tiet trong leave-request.service.ts.
    if (currentUser.role !== Role.ADMIN && ot.requestedBy === currentUser.id) {
      throw new ForbiddenException({ key: 'CANNOT_APPROVE_OWN_REQUEST' });
    }

    return this.prisma.overtimeRequest.update({
      where: { id },
      data: {
        status: OvertimeRequestStatus.PENDING_HR_APPROVAL,
        managerApprovedBy: currentUser.id,
        managerApprovedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  async approveHr(id: number, currentUser: RequestUser) {
    const ot = await this.findOne(id);
    this.assertStatus(ot, [OvertimeRequestStatus.PENDING_HR_APPROVAL], 'duyet HR');

    return this.prisma.overtimeRequest.update({
      where: { id },
      data: {
        status: OvertimeRequestStatus.APPROVED,
        hrApprovedBy: currentUser.id,
        hrApprovedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  async reject(id: number, dto: RejectOvertimeRequestDto, currentUser: RequestUser) {
    const ot = await this.findOne(id);
    this.assertStatus(
      ot,
      [OvertimeRequestStatus.PENDING_MANAGER_APPROVAL, OvertimeRequestStatus.PENDING_HR_APPROVAL],
      'tu choi',
    );

    if (
      ot.status === OvertimeRequestStatus.PENDING_MANAGER_APPROVAL &&
      currentUser.role !== Role.ADMIN &&
      ot.departmentId !== currentUser.departmentId
    ) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }

    return this.prisma.overtimeRequest.update({
      where: { id },
      data: {
        status: OvertimeRequestStatus.REJECTED,
        rejectedBy: currentUser.id,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
        updatedBy: currentUser.id,
      },
    });
  }

  private assertOwner(ot: { requestedBy: number }, currentUser: RequestUser) {
    if (currentUser.role !== Role.ADMIN && ot.requestedBy !== currentUser.id) {
      throw new ForbiddenException({ key: 'ONLY_OWNER_CAN_MODIFY' });
    }
  }

  private assertStatus(ot: { status: OvertimeRequestStatus }, allowed: OvertimeRequestStatus[], action: string) {
    if (!allowed.includes(ot.status)) {
      throw new ConflictException({ key: 'INVALID_STATUS_TRANSITION', params: { action, status: ot.status } });
    }
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.overtimeRequest.count({ where: { code: { startsWith: `OT-${year}-` } } });
    const seq = String(count + 1).padStart(6, '0');
    return `OT-${year}-${seq}`;
  }
}
