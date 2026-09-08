import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import { RejectLeaveRequestDto } from './dto/reject-leave-request.dto';
import { LeaveRequestStatus, Prisma, Role } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPagination } from '../../common/pagination.util';

// Moi service tu dinh nghia RequestUser cuc bo (dung convention da co trong
// du an — xem stocktake.service.ts).
export interface RequestUser {
  id: number;
  role: Role;
  departmentId: number;
}

@Injectable()
export class LeaveRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLeaveRequestDto, currentUser: RequestUser) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (start > end) {
      throw new BadRequestException({ key: 'INVALID_DATE_RANGE' });
    }

    const code = await this.generateCode();

    return this.prisma.leaveRequest.create({
      data: {
        code,
        requestedBy: currentUser.id,
        departmentId: currentUser.departmentId,
        leaveType: dto.leaveType,
        startDate: start,
        endDate: end,
        reason: dto.reason,
        status: LeaveRequestStatus.DRAFT,
        createdBy: currentUser.id,
      },
    });
  }

  async findAll(query: PaginationQueryDto & { status?: LeaveRequestStatus; departmentId?: number }) {
    const { skip, take, page, limit } = buildPagination(query.page, query.limit);
    const where: Prisma.LeaveRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { department: true },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const found = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { department: true },
    });
    if (!found) throw new NotFoundException({ key: 'ENTITY_NOT_FOUND', params: { entity: 'LeaveRequest', id } });
    return found;
  }

  async update(id: number, dto: UpdateLeaveRequestDto, currentUser: RequestUser) {
    const lr = await this.findOne(id);
    this.assertStatus(lr, [LeaveRequestStatus.DRAFT], 'chinh sua');
    this.assertOwner(lr, currentUser);

    if (dto.startDate && dto.endDate && new Date(dto.startDate) > new Date(dto.endDate)) {
      throw new BadRequestException({ key: 'INVALID_DATE_RANGE' });
    }

    return this.prisma.leaveRequest.update({
      where: { id },
      data: {
        ...(dto.leaveType ? { leaveType: dto.leaveType } : {}),
        ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.reason ? { reason: dto.reason } : {}),
        updatedBy: currentUser.id,
      },
    });
  }

  async remove(id: number, currentUser: RequestUser) {
    const lr = await this.findOne(id);
    this.assertStatus(lr, [LeaveRequestStatus.DRAFT], 'xoa');
    this.assertOwner(lr, currentUser);
    return this.prisma.leaveRequest.delete({ where: { id } });
  }

  async submit(id: number, currentUser: RequestUser) {
    const lr = await this.findOne(id);
    this.assertStatus(lr, [LeaveRequestStatus.DRAFT], 'gui duyet');
    this.assertOwner(lr, currentUser);

    return this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.PENDING_MANAGER_APPROVAL,
        submittedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  async cancel(id: number, currentUser: RequestUser) {
    const lr = await this.findOne(id);
    this.assertStatus(
      lr,
      [LeaveRequestStatus.DRAFT, LeaveRequestStatus.PENDING_MANAGER_APPROVAL, LeaveRequestStatus.PENDING_HR_APPROVAL],
      'huy',
    );
    this.assertOwner(lr, currentUser);

    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: LeaveRequestStatus.CANCELLED, cancelledAt: new Date(), updatedBy: currentUser.id },
    });
  }

  async approveManager(id: number, currentUser: RequestUser) {
    const lr = await this.findOne(id);
    this.assertStatus(lr, [LeaveRequestStatus.PENDING_MANAGER_APPROVAL], 'duyet quan ly');

    // Truong bo phan chi duyet duoc don cua dung phong ban minh (tru Admin).
    if (currentUser.role !== Role.ADMIN && lr.departmentId !== currentUser.departmentId) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }

    return this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.PENDING_HR_APPROVAL,
        managerApprovedBy: currentUser.id,
        managerApprovedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  async approveHr(id: number, currentUser: RequestUser) {
    const lr = await this.findOne(id);
    this.assertStatus(lr, [LeaveRequestStatus.PENDING_HR_APPROVAL], 'duyet HR');

    return this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.APPROVED,
        hrApprovedBy: currentUser.id,
        hrApprovedAt: new Date(),
        updatedBy: currentUser.id,
      },
    });
  }

  async reject(id: number, dto: RejectLeaveRequestDto, currentUser: RequestUser) {
    const lr = await this.findOne(id);
    this.assertStatus(
      lr,
      [LeaveRequestStatus.PENDING_MANAGER_APPROVAL, LeaveRequestStatus.PENDING_HR_APPROVAL],
      'tu choi',
    );

    if (
      lr.status === LeaveRequestStatus.PENDING_MANAGER_APPROVAL &&
      currentUser.role !== Role.ADMIN &&
      lr.departmentId !== currentUser.departmentId
    ) {
      throw new ForbiddenException({ key: 'NOT_IN_YOUR_DEPARTMENT' });
    }

    return this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.REJECTED,
        rejectedBy: currentUser.id,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
        updatedBy: currentUser.id,
      },
    });
  }

  private assertOwner(lr: { requestedBy: number }, currentUser: RequestUser) {
    if (currentUser.role !== Role.ADMIN && lr.requestedBy !== currentUser.id) {
      throw new ForbiddenException({ key: 'ONLY_OWNER_CAN_MODIFY' });
    }
  }

  private assertStatus(lr: { status: LeaveRequestStatus }, allowed: LeaveRequestStatus[], action: string) {
    if (!allowed.includes(lr.status)) {
      throw new ConflictException({ key: 'INVALID_STATUS_TRANSITION', params: { action, status: lr.status } });
    }
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.leaveRequest.count({
      where: { code: { startsWith: `LR-${year}-` } },
    });
    const seq = String(count + 1).padStart(6, '0');
    return `LR-${year}-${seq}`;
  }
}
